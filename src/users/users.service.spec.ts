import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { Prisma } from "@prisma/client";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PasswordService } from "@/common/security/password.service";

import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";

import { PrismaService } from "@/prisma/prisma.service";

import { CreateUserInput } from "@/users/dto/create-user.input";
import { CreatedUserSelect } from "@/users/dto/created-user.dto";

import { UpdateUserInput } from "@/users/dto/update-user.input";

import { SafeUserSelect } from "@/users/dto/safe-user.dto";
import { UserCacheService } from "@/users/user-cache.service";
import { UserProfileReadService } from "@/users/user-profile-read.service";

import { UsersService } from "./users.service";

describe("UsersService", () => {
  let service: UsersService;
  let moduleRef: TestingModule;
  const makeUser = (id: number) => ({
    id,
    name: `User ${id}`,
    username: `user${id}`,
    createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
    updatedAt: new Date(`2026-04-0${id}T01:00:00.000Z`),
    _count: {
      likes: id,
      posts: id + 1,
      followers: id + 2,
      following: id + 3,
    },
  });

  const prismaMock: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  } = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const cacheMock: {
    get: jest.Mock;
    getVersion: jest.Mock;
    bumpVersion: jest.Mock;
    del: jest.Mock;
    getOrSet: jest.Mock;
    set: jest.Mock;
  } = {
    get: jest.fn(),
    getVersion: jest.fn(),
    bumpVersion: jest.fn(),
    del: jest.fn(),
    getOrSet: jest.fn(),
    set: jest.fn(),
  };

  const passwordMock: {
    hashPassword: jest.Mock;
  } = {
    hashPassword: jest.fn(),
  };

  const userProfileReadMock: {
    findUsers: jest.Mock;
    getUser: jest.Mock;
    getUserByUsername: jest.Mock;
    getMyProfile: jest.Mock;
    toPublicUserView: jest.Mock;
  } = {
    findUsers: jest.fn(),
    getUser: jest.fn(),
    getUserByUsername: jest.fn(),
    getMyProfile: jest.fn(),
    toPublicUserView: jest.fn(
      (user: { avatarMedia?: { objectKey: string } }) => ({
        ...user,
        avatarUrl: user.avatarMedia?.objectKey
          ? `https://media.example.com/${user.avatarMedia.objectKey}`
          : null,
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: behave like cache wrapper (execute the factory)
    cacheMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        UserCacheService,
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: PasswordService, useValue: passwordMock },
        { provide: UserProfileReadService, useValue: userProfileReadMock },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("findUsers", () => {
    it("caps first, builds a cursor-aware cache key, and queries prisma with SafeUserSelect", async () => {
      cacheMock.getVersion.mockResolvedValue(4);
      const rows = [makeUser(3), makeUser(2), makeUser(1)];
      userProfileReadMock.findUsers.mockResolvedValue(rows);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      const res = await service.findUsers({
        first: PAGINATION.MAX_TAKE + 999,
        after,
      });

      const expectedTake = PAGINATION.MAX_TAKE;

      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:user:list");
      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `user:list:v=4:first=${expectedTake}:after=${after}:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        60_000,
      );

      expect(userProfileReadMock.findUsers).toHaveBeenCalledWith({
        limit: expectedTake,
        orderBy: ChronologicalOrder.NEWEST,
        sortDirection: "desc",
        cursorFilter: {
          OR: [
            { createdAt: { lt: new Date("2026-04-10T00:00:00.000Z") } },
            {
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
              id: { lt: 999 },
            },
          ],
        },
      });

      expect(res.items).toEqual(rows);
      expect(res.pageInfo.hasNextPage).toBe(false);
    });

    it("defaults first to PAGINATION.DEFAULT_TAKE", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      userProfileReadMock.findUsers.mockResolvedValue([]);

      await service.findUsers();

      expect(userProfileReadMock.findUsers).toHaveBeenCalledWith({
        limit: PAGINATION.DEFAULT_TAKE,
        orderBy: ChronologicalOrder.NEWEST,
        cursorFilter: undefined,
        sortDirection: "desc",
      });
    });

    it("uses a distinct cache key and ascending order for OLDEST", async () => {
      cacheMock.getVersion.mockResolvedValue(2);
      userProfileReadMock.findUsers.mockResolvedValue([]);

      await service.findUsers({ orderBy: ChronologicalOrder.OLDEST });

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `user:list:v=2:first=${PAGINATION.DEFAULT_TAKE}:after=none:order=${ChronologicalOrder.OLDEST}`,
        expect.any(Function),
        60_000,
      );

      expect(userProfileReadMock.findUsers).toHaveBeenCalledWith({
        limit: PAGINATION.DEFAULT_TAKE,
        orderBy: ChronologicalOrder.OLDEST,
        cursorFilter: undefined,
        sortDirection: "asc",
      });
    });

    it("throws BadRequestException for an invalid cursor", async () => {
      await expect(
        service.findUsers({ first: 5, after: "%%%invalid%%%" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(userProfileReadMock.findUsers).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST cursor pagination", async () => {
      cacheMock.getVersion.mockResolvedValue(3);
      userProfileReadMock.findUsers.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.findUsers({
        first: 5,
        after,
        orderBy: ChronologicalOrder.OLDEST,
      });

      expect(userProfileReadMock.findUsers).toHaveBeenCalledWith({
        limit: 5,
        orderBy: ChronologicalOrder.OLDEST,
        sortDirection: "asc",
        cursorFilter: {
          OR: [
            { createdAt: { gt: new Date("2026-04-10T00:00:00.000Z") } },
            {
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
              id: { gt: 999 },
            },
          ],
        },
      });
    });
  });

  describe("getUser", () => {
    it("returns user and caches longer (5 min)", async () => {
      userProfileReadMock.getUser.mockResolvedValue({ id: 7 });

      const res = await service.getUser(7);

      expect(userProfileReadMock.getUser).toHaveBeenCalledWith(7, undefined);

      expect(res).toEqual({ id: 7 });
    });

    it("throws NotFoundException when user does not exist", async () => {
      userProfileReadMock.getUser.mockRejectedValue(new NotFoundException());

      await expect(service.getUser(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("getUserByUsername", () => {
    it("normalizes username, resolves by username on cache miss, and seeds both caches", async () => {
      userProfileReadMock.getUserByUsername.mockResolvedValue({
        id: 7,
        name: "John",
        username: "john",
      });

      const res = await service.getUserByUsername("  JoHn  ");

      expect(userProfileReadMock.getUserByUsername).toHaveBeenCalledWith(
        "  JoHn  ",
        undefined,
      );
      expect(res).toEqual({
        id: 7,
        name: "John",
        username: "john",
      });
    });

    it("reuses the canonical id lookup when the username alias cache hits", async () => {
      userProfileReadMock.getUserByUsername.mockResolvedValue({ id: 7 });

      const res = await service.getUserByUsername("john");

      expect(userProfileReadMock.getUserByUsername).toHaveBeenCalledWith(
        "john",
        undefined,
      );
      expect(res).toEqual({ id: 7 });
    });

    it("throws NotFoundException when username does not exist", async () => {
      userProfileReadMock.getUserByUsername.mockRejectedValue(
        new NotFoundException(),
      );

      await expect(service.getUserByUsername("missing")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("createUser", () => {
    it("throws BadRequestException when required fields are empty after trim", async () => {
      await expect(
        service.createUser({
          name: "   ",
          email: "a@a.com",
          username: "john",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createUser({
          name: "John",
          email: "   ",
          username: "john",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createUser({
          name: "John",
          email: "a@a.com",
          username: "   ",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createUser({
          name: "John",
          email: "a@a.com",
          username: "john",
          password: "   ",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.user.create).not.toHaveBeenCalled();
    });

    it("hashes password, creates user with normalized inputs, caches profile, bumps list version", async () => {
      passwordMock.hashPassword.mockResolvedValue("hashedPw");

      const created = {
        id: 10,
        name: "John",
        username: "john",
        createdAt: new Date("2026-04-06T00:00:00.000Z"),
        updatedAt: new Date("2026-04-06T00:00:00.000Z"),
      };
      prismaMock.user.create.mockResolvedValue(created);

      const input: CreateUserInput = {
        name: "  John  ",
        email: "  A@A.COM  ",
        username: "  JoHn  ",
        password: "  password123  ",
      };
      const res = await service.createUser(input);

      expect(passwordMock.hashPassword).toHaveBeenCalledWith("password123");

      expect(prismaMock.user.create).toHaveBeenCalledWith({
        data: {
          name: "John",
          email: "a@a.com",
          username: "john",
          password: "hashedPw",
        },
        select: CreatedUserSelect,
      });

      expect(cacheMock.set).toHaveBeenCalledWith(
        "user:lookup:username:john",
        10,
        5 * 60_000,
      );
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual(created);
    });

    it("throws ConflictException with precise message when Prisma P2002 targets email", async () => {
      passwordMock.hashPassword.mockResolvedValue("hashedPw");

      const err = new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["email"] },
      });

      prismaMock.user.create.mockRejectedValue(err);

      await expect(
        service.createUser({
          name: "John",
          email: "a@a.com",
          username: "john",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws ConflictException with precise message when Prisma P2002 targets username", async () => {
      passwordMock.hashPassword.mockResolvedValue("hashedPw");

      const err = new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["username"] },
      });

      prismaMock.user.create.mockRejectedValue(err);

      await expect(
        service.createUser({
          name: "John",
          email: "a@a.com",
          username: "john",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws ConflictException fallback when Prisma P2002 has no meta target", async () => {
      passwordMock.hashPassword.mockResolvedValue("hashedPw");

      const err = new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
      });

      prismaMock.user.create.mockRejectedValue(err);

      await expect(
        service.createUser({
          name: "John",
          email: "a@a.com",
          username: "john",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws InternalServerErrorException for unknown errors", async () => {
      passwordMock.hashPassword.mockResolvedValue("hashedPw");
      prismaMock.user.create.mockRejectedValue(new Error("boom"));

      await expect(
        service.createUser({
          name: "John",
          email: "a@a.com",
          username: "john",
          password: "password123",
        }),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("returns the created user even if cache refresh fails", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      passwordMock.hashPassword.mockResolvedValue("hashedPw");
      prismaMock.user.create.mockResolvedValue({
        id: 10,
        name: "John",
        username: "john",
        createdAt: new Date("2026-04-06T00:00:00.000Z"),
        updatedAt: new Date("2026-04-06T00:00:00.000Z"),
      });
      cacheMock.set.mockRejectedValueOnce(new Error("cache down"));

      await expect(
        service.createUser({
          name: "John",
          email: "a@a.com",
          username: "john",
          password: "password123",
        }),
      ).resolves.toEqual({
        id: 10,
        name: "John",
        username: "john",
        createdAt: new Date("2026-04-06T00:00:00.000Z"),
        updatedAt: new Date("2026-04-06T00:00:00.000Z"),
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to refresh caches after creating user 10",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe("updateUser", () => {
    it("throws BadRequestException when no fields provided", async () => {
      const input: UpdateUserInput = {};
      await expect(service.updateUser(input, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("validates empty fields after trim", async () => {
      await expect(
        service.updateUser({ name: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.updateUser({ email: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.updateUser({ username: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.updateUser({ password: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("hashes password when updating password", async () => {
      passwordMock.hashPassword.mockResolvedValue("hashedNew");

      prismaMock.user.update.mockResolvedValue({
        id: 1,
        name: "John",
        email: "a@a.com",
        username: "john",
      });

      await service.updateUser({ password: "  newpass123  " }, 1);

      expect(passwordMock.hashPassword).toHaveBeenCalledWith("newpass123");

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { password: "hashedNew" },
        select: SafeUserSelect,
      });
    });

    it("updates user with normalized fields, caches profile, bumps list version", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        username: "olduser",
      });
      prismaMock.user.update.mockResolvedValue({
        id: 2,
        name: "New Name",
        email: "x@y.com",
        username: "newuser",
      });

      const input: UpdateUserInput = {
        name: "  New Name  ",
        email: "  X@Y.COM ",
        username: "  NewUser ",
      };
      const res = await service.updateUser(input, 2);

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { name: "New Name", email: "x@y.com", username: "newuser" },
        select: SafeUserSelect,
      });

      expect(cacheMock.set).toHaveBeenCalledWith(
        "user:safe:2",
        res,
        5 * 60_000,
      );
      expect(cacheMock.del).toHaveBeenCalledWith(
        "user:lookup:username:olduser",
      );
      expect(cacheMock.set).toHaveBeenCalledWith(
        "user:lookup:username:newuser",
        2,
        5 * 60_000,
      );
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");
    });

    it("does not prefetch the current username when username is not being updated", async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 2,
        name: "New Name",
        email: "x@y.com",
        username: "currentuser",
      });

      await service.updateUser({ name: "New Name" }, 2);

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(cacheMock.set).toHaveBeenCalledWith(
        "user:lookup:username:currentuser",
        2,
        5 * 60_000,
      );
    });

    it("throws NotFoundException on Prisma P2025", async () => {
      const err = new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.user.update.mockRejectedValue(err);

      await expect(
        service.updateUser({ name: "okay" }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ConflictException with precise message on Prisma P2002 target email", async () => {
      const err = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["email"] },
      });
      prismaMock.user.update.mockRejectedValue(err);

      await expect(
        service.updateUser({ email: "x@y.com" }, 1),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws ConflictException with precise message on Prisma P2002 target username", async () => {
      const err = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["username"] },
      });
      prismaMock.user.update.mockRejectedValue(err);

      await expect(
        service.updateUser({ username: "new" }, 1),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws ConflictException fallback on Prisma P2002 without meta target", async () => {
      const err = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      });
      prismaMock.user.update.mockRejectedValue(err);

      await expect(
        service.updateUser({ username: "new" }, 1),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("throws InternalServerErrorException for unexpected update errors", async () => {
      prismaMock.user.update.mockRejectedValue(new Error("boom"));

      await expect(
        service.updateUser({ name: "okay" }, 1),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe("updateMyProfile", () => {
    it("validates that at least one profile field is provided", async () => {
      await expect(service.updateMyProfile({}, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prismaMock.user.update).not.toHaveBeenCalled();
    });

    it("normalizes profile fields, updates the user, and refreshes profile caches", async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 2,
        name: "Miguel",
        username: "miguel",
        bio: "Hello world",
        websiteUrl: "https://example.com",
        location: "Recife",
        avatarMedia: null,
      });

      const result = await service.updateMyProfile(
        {
          bio: "  Hello   world  ",
          websiteUrl: " https://example.com ",
          location: " Recife ",
        },
        2,
      );

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: {
          bio: "Hello world",
          websiteUrl: "https://example.com",
          location: "Recife",
        },
        select: SafeUserSelect,
      });
      expect(cacheMock.set).toHaveBeenCalledWith(
        "user:safe:2",
        result,
        5 * 60_000,
      );
      expect(cacheMock.set).toHaveBeenCalledWith(
        "user:lookup:username:miguel",
        2,
        5 * 60_000,
      );
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");
    });

    it("allows clearing nullable profile fields", async () => {
      prismaMock.user.update.mockResolvedValue({
        id: 2,
        name: "Miguel",
        username: "miguel",
        bio: null,
        websiteUrl: null,
        location: null,
        avatarMedia: null,
      });

      await service.updateMyProfile(
        {
          bio: null,
          websiteUrl: null,
          location: null,
        },
        2,
      );

      expect(prismaMock.user.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: {
          bio: null,
          websiteUrl: null,
          location: null,
        },
        select: SafeUserSelect,
      });
    });
  });

  describe("deleteUser", () => {
    it("deletes user, clears cache, bumps list version, and returns message", async () => {
      prismaMock.user.delete.mockResolvedValue({ username: "john" });

      const res = await service.deleteUser(1);

      expect(prismaMock.user.delete).toHaveBeenCalledWith({
        where: { id: 1 },
        select: { username: true },
      });

      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
      expect(cacheMock.del).toHaveBeenCalledWith("user:lookup:username:john");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual({ message: "User deleted successfully" });
    });

    it("throws NotFoundException on Prisma P2025", async () => {
      const err = new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.user.delete.mockRejectedValue(err);

      await expect(service.deleteUser(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns success even if cache refresh fails after delete", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.user.delete.mockResolvedValue({ id: 1 });
      cacheMock.del.mockRejectedValueOnce(new Error("cache down"));

      await expect(service.deleteUser(1)).resolves.toEqual({
        message: "User deleted successfully",
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to refresh caches after deleting user 1",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it("throws InternalServerErrorException for unexpected delete errors", async () => {
      prismaMock.user.delete.mockRejectedValue(new Error("boom"));

      await expect(service.deleteUser(1)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});

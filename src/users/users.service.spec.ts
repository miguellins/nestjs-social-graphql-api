import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { UsersService } from "./users.service";
import { PrismaService } from "@/prisma.service";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PasswordService } from "@/common/security/password.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { SafeUserSelect } from "@/users/dto/safe-user.dto";
import { CreateUserInput } from "@/users/dto/create-user.input";
import { UpdateUserInput } from "@/users/dto/update-user.input";

describe("UsersService", () => {
  let service: UsersService;
  let moduleRef: TestingModule;

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
    getVersion: jest.Mock;
    bumpVersion: jest.Mock;
    del: jest.Mock;
    getOrSet: jest.Mock;
    set: jest.Mock;
  } = {
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

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: behave like cache wrapper (execute the factory)
    cacheMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: PasswordService, useValue: passwordMock },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("findUsers", () => {
    it("caps take, builds versioned cache key, and queries prisma with SafeUserSelect", async () => {
      cacheMock.getVersion.mockResolvedValue(4);
      prismaMock.user.findMany.mockResolvedValue([{ id: 1 }]);

      const res = await service.findUsers({ take: PAGINATION.MAX_TAKE + 999 });

      const expectedTake = PAGINATION.MAX_TAKE;

      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:user:list");
      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `user:list:v=4:take=${expectedTake}:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        60_000,
      );

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        take: expectedTake,
        orderBy: { createdAt: "desc" },
        select: SafeUserSelect,
      });

      expect(res).toEqual([{ id: 1 }]);
    });

    it("defaults take to PAGINATION.DEFAULT_TAKE", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.user.findMany.mockResolvedValue([]);

      await service.findUsers();

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        orderBy: { createdAt: "desc" },
        select: SafeUserSelect,
      });
    });

    it("uses a distinct cache key and ascending order for OLDEST", async () => {
      cacheMock.getVersion.mockResolvedValue(2);
      prismaMock.user.findMany.mockResolvedValue([]);

      await service.findUsers({ orderBy: ChronologicalOrder.OLDEST });

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `user:list:v=2:take=${PAGINATION.DEFAULT_TAKE}:order=${ChronologicalOrder.OLDEST}`,
        expect.any(Function),
        60_000,
      );

      expect(prismaMock.user.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        orderBy: { createdAt: "asc" },
        select: SafeUserSelect,
      });
    });
  });

  describe("getUser", () => {
    it("returns user and caches longer (5 min)", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 7 });

      const res = await service.getUser(7);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        "user:safe:7",
        expect.any(Function),
        5 * 60_000,
      );

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 7 },
        select: SafeUserSelect,
      });

      expect(res).toEqual({ id: 7 });
    });

    it("throws NotFoundException when user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.getUser(999)).rejects.toBeInstanceOf(
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
        email: "a@a.com",
        username: "john",
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
        select: SafeUserSelect,
      });

      expect(cacheMock.set).toHaveBeenCalledWith(
        "user:safe:10",
        created,
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
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");
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

    it("throws InternalServerErrorException for unknown errors", async () => {
      prismaMock.user.update.mockRejectedValue(new Error("boom"));

      await expect(
        service.updateUser({ name: "okay" }, 1),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe("deleteUser", () => {
    it("deletes user, clears cache, bumps list version, and returns message", async () => {
      prismaMock.user.delete.mockResolvedValue({ id: 1 });

      const res = await service.deleteUser(1);

      expect(prismaMock.user.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });

      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
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

    it("throws InternalServerErrorException for unknown errors", async () => {
      prismaMock.user.delete.mockRejectedValue(new Error("boom"));

      await expect(service.deleteUser(1)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});

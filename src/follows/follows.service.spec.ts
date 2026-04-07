import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { Prisma } from "@prisma/client";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";

import { SafeFollowSelect } from "@/follows/dto/safe-follow.dto";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";

import { FollowsService } from "./follows.service";

describe("FollowsService", () => {
  let service: FollowsService;
  let moduleRef: TestingModule;
  const makeFollow = (id: number) => ({
    id,
    createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
    followerId: id,
    followingId: id + 10,
    follower: {
      id,
      name: `Follower ${id}`,
      username: `follower${id}`,
    },
    following: {
      id: id + 10,
      name: `Following ${id}`,
      username: `following${id}`,
    },
  });

  const prismaMock: {
    follow: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  } = {
    follow: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const cacheMock: {
    getVersion: jest.Mock;
    bumpVersion: jest.Mock;
    del: jest.Mock;
    getOrSet: jest.Mock;
  } = {
    getVersion: jest.fn(),
    bumpVersion: jest.fn(),
    del: jest.fn(),
    getOrSet: jest.fn(),
  };

  const notificationTriggerMock: {
    notifyUserFollowed: jest.Mock;
  } = {
    notifyUserFollowed: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    // Default: behave like a real cache wrapper: call the factory and return its result
    cacheMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        FollowsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        {
          provide: NotificationTriggerService,
          useValue: notificationTriggerMock,
        },
      ],
    }).compile();

    service = moduleRef.get(FollowsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("findFollows", () => {
    it("uses a cursor-aware cache key and queries prisma with SafeFollowSelect", async () => {
      cacheMock.getVersion.mockResolvedValue(3);

      const rows = [makeFollow(3), makeFollow(2), makeFollow(1)];
      prismaMock.follow.findMany.mockResolvedValue(rows);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      const res = await service.findFollows({
        first: PAGINATION.MAX_TAKE + 999,
        after,
      });

      const expectedTake = PAGINATION.MAX_TAKE;
      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:follows:list");

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `follows:list:v3:first=${expectedTake}:after=${after}:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.follow.findMany).toHaveBeenCalledWith({
        take: expectedTake + 1,
        where: {
          OR: [
            { createdAt: { lt: new Date("2026-04-10T00:00:00.000Z") } },
            {
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
              id: { lt: 999 },
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafeFollowSelect,
      });

      expect(res.items).toEqual(rows);
      expect(res.pageInfo.hasNextPage).toBe(false);
    });

    it("defaults first to PAGINATION.DEFAULT_TAKE", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.follow.findMany.mockResolvedValue([]);

      await service.findFollows();

      expect(prismaMock.follow.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: undefined,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafeFollowSelect,
      });
    });

    it("throws BadRequestException for an invalid cursor", async () => {
      await expect(
        service.findFollows({ first: 5, after: "%%%invalid%%%" }),
      ).rejects.toThrow("Invalid cursor");

      expect(prismaMock.follow.findMany).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST follow pagination", async () => {
      cacheMock.getVersion.mockResolvedValue(4);
      prismaMock.follow.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.findFollows({
        first: 5,
        after,
        orderBy: ChronologicalOrder.OLDEST,
      });

      expect(prismaMock.follow.findMany).toHaveBeenCalledWith({
        take: 6,
        where: {
          OR: [
            { createdAt: { gt: new Date("2026-04-10T00:00:00.000Z") } },
            {
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
              id: { gt: 999 },
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: SafeFollowSelect,
      });
    });
  });

  describe("getFollow", () => {
    it("returns follow from cache factory and throws NotFound when not found", async () => {
      prismaMock.follow.findUnique.mockResolvedValue(null);

      await expect(service.getFollow(123)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        "follow:detail:123",
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.follow.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        select: SafeFollowSelect,
      });
    });

    it("returns follow when found", async () => {
      const follow = { id: 1, followerId: 10, followingId: 20 };
      prismaMock.follow.findUnique.mockResolvedValue(follow);

      const res = await service.getFollow(1);

      expect(res).toEqual(follow);
    });
  });

  describe("createFollow", () => {
    it("throws BadRequest when user tries to follow themselves", async () => {
      await expect(service.createFollow(5, 5)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.follow.create).not.toHaveBeenCalled();
    });

    it("throws NotFound when target user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.createFollow(1, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 999 },
        select: { id: true },
      });

      expect(prismaMock.follow.create).not.toHaveBeenCalled();
    });

    it("creates follow and bumps/invalidates caches on success", async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({ id: 1, username: "alice" });

      const created = { id: 50, followerId: 1, followingId: 2 };
      prismaMock.follow.create.mockResolvedValue(created);

      const res = await service.createFollow(1, 2);

      expect(prismaMock.follow.create).toHaveBeenCalledWith({
        data: { followerId: 1, followingId: 2 },
        select: SafeFollowSelect,
      });

      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:follows:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:2");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(notificationTriggerMock.notifyUserFollowed).toHaveBeenCalledWith({
        recipientId: 2,
        actorId: 1,
        actorUsername: "alice",
        followId: 50,
      });

      expect(res).toEqual(created);
    });

    it("throws NotFound when current user does not exist", async () => {
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce(null);

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.follow.create).not.toHaveBeenCalled();
    });

    it("returns follow even if notification publish fails", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({ id: 1, username: "alice" });

      const created = { id: 50, followerId: 1, followingId: 2 };
      prismaMock.follow.create.mockResolvedValue(created);
      notificationTriggerMock.notifyUserFollowed.mockRejectedValue(
        new Error("notify failed"),
      );

      const res = await service.createFollow(1, 2);

      expect(res).toEqual(created);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to create follow notification for user 2",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it("returns follow even if cache invalidation fails after commit", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.user.findUnique
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({ id: 1, username: "alice" });

      const created = { id: 50, followerId: 1, followingId: 2 };
      prismaMock.follow.create.mockResolvedValue(created);
      cacheMock.bumpVersion.mockRejectedValueOnce(new Error("cache down"));

      await expect(service.createFollow(1, 2)).resolves.toEqual(created);

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after creating follow 50",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it("throws ConflictException on unique constraint (P2002)", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });

      const err = new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      });
      prismaMock.follow.create.mockRejectedValue(err);

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("throws NotFoundException on FK/record errors (P2003 or P2025)", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });

      const err1 = new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      });
      prismaMock.follow.create.mockRejectedValue(err1);

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const err2 = new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.follow.create.mockRejectedValue(err2);

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lets unexpected write errors bubble for the global filter to normalize", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.follow.create.mockRejectedValue(new Error("boom"));

      await expect(service.createFollow(1, 2)).rejects.toThrow("boom");
    });
  });

  describe("deleteFollow", () => {
    it("deletes by followingId when relation id is not provided", async () => {
      prismaMock.follow.findUnique
        .mockResolvedValueOnce({
          id: 55,
          followerId: 1,
          followingId: 2,
        })
        .mockResolvedValueOnce(null);

      prismaMock.follow.delete.mockResolvedValue({ id: 55 });

      const res = await service.deleteFollow(2, 1);

      expect(prismaMock.follow.delete).toHaveBeenCalledWith({
        where: { id: 55 },
      });

      expect(res).toEqual({ message: "Follow deleted successfully" });
    });

    it("throws NotFound if follow does not exist", async () => {
      prismaMock.follow.findUnique.mockResolvedValue(null);

      await expect(service.deleteFollow(10, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.follow.delete).not.toHaveBeenCalled();
    });

    it("throws Forbidden if current user is not the follower", async () => {
      prismaMock.follow.findUnique.mockResolvedValue({
        id: 10,
        followerId: 999,
        followingId: 2,
      });

      await expect(service.deleteFollow(10, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(prismaMock.follow.delete).not.toHaveBeenCalled();
    });

    it("deletes follow and invalidates caches on success", async () => {
      prismaMock.follow.findUnique.mockResolvedValue({
        id: 10,
        followerId: 1,
        followingId: 2,
      });

      prismaMock.follow.delete.mockResolvedValue({ id: 10 });

      const res = await service.deleteFollow(10, 1);

      expect(prismaMock.follow.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });

      expect(cacheMock.del).toHaveBeenCalledWith("follow:detail:10");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:follows:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:2");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual({ message: "Follow deleted successfully" });
    });

    it("throws NotFound when Prisma delete fails with P2025 (race condition)", async () => {
      prismaMock.follow.findUnique.mockResolvedValue({
        id: 10,
        followerId: 1,
        followingId: 2,
      });

      const err = new Prisma.PrismaClientKnownRequestError("gone", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.follow.delete.mockRejectedValue(err);

      await expect(service.deleteFollow(10, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns success even if cache invalidation fails after delete", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.follow.findUnique.mockResolvedValue({
        id: 10,
        followerId: 1,
        followingId: 2,
      });

      prismaMock.follow.delete.mockResolvedValue({ id: 10 });
      cacheMock.del.mockRejectedValueOnce(new Error("cache down"));

      await expect(service.deleteFollow(10, 1)).resolves.toEqual({
        message: "Follow deleted successfully",
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after deleting follow 10",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it("lets unexpected delete errors bubble for the global filter to normalize", async () => {
      prismaMock.follow.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.deleteFollow(10, 1)).rejects.toThrow("boom");
    });
  });
});

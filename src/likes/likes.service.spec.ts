import {
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

import { LikeDetailSelect } from "@/likes/dto/like-detail.dto";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";

import { LikesService } from "./likes.service";

describe("LikesService", () => {
  let service: LikesService;
  let moduleRef: TestingModule;
  const makeLike = (id: number) => ({
    id,
    createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
    userId: id,
    postId: id + 10,
    user: {
      id,
      name: `User ${id}`,
      username: `user${id}`,
    },
    post: {
      id: id + 10,
      title: `Post ${id}`,
      content: `Content ${id}`,
      createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
      likesCount: id,
      author: {
        id,
        name: `User ${id}`,
        username: `user${id}`,
      },
    },
  });

  const prismaMock: {
    like: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    post: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    like: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
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

  const mem = new Map<string, unknown>();

  const notificationTriggerMock: {
    notifyPostLiked: jest.Mock;
  } = {
    notifyPostLiked: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mem.clear();

    prismaMock.user.findUnique.mockResolvedValue({
      id: 10,
      username: "tester",
    });
    prismaMock.post.findUnique.mockResolvedValue({
      id: 20,
      authorId: 2,
    });

    cacheMock.getOrSet.mockImplementation(
      async (key: string, factory: () => Promise<unknown>) => {
        if (mem.has(key)) return mem.get(key);
        const data = await factory();
        mem.set(key, data);
        return data;
      },
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        LikesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        {
          provide: NotificationTriggerService,
          useValue: notificationTriggerMock,
        },
      ],
    }).compile();

    service = moduleRef.get(LikesService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("findLikes", () => {
    it("builds a cursor-aware cache key and queries prisma with correct where/select", async () => {
      cacheMock.getVersion.mockResolvedValue(9);
      const rows = [makeLike(3), makeLike(2), makeLike(1)];
      prismaMock.like.findMany.mockResolvedValue(rows);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      const params = {
        first: PAGINATION.MAX_TAKE + 999,
        after,
        postId: 20,
        userId: 10,
      };
      const res = await service.findLikes(params);

      const expectedTake = PAGINATION.MAX_TAKE;

      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:likes:list");
      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `likes:list:v9:first=${expectedTake}:after=${after}:p20:u10:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: expectedTake + 1,
        where: {
          AND: [
            {
              post: {
                is: {
                  removedAt: null,
                },
              },
            },
            { postId: 20 },
            { userId: 10 },
            {
              OR: [
                { createdAt: { lt: new Date("2026-04-10T00:00:00.000Z") } },
                {
                  createdAt: new Date("2026-04-10T00:00:00.000Z"),
                  id: { lt: 999 },
                },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: LikeDetailSelect,
      });

      expect(res.items).toEqual(rows);
      expect(res.pageInfo.hasNextPage).toBe(false);
    });

    it("omits where filters when postId/userId are not provided and uses defaults", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.like.findMany.mockResolvedValue([]);

      await service.findLikes(undefined);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `likes:list:v1:first=${PAGINATION.DEFAULT_TAKE}:after=none:pall:uall:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: {
          post: {
            is: {
              removedAt: null,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: LikeDetailSelect,
      });
    });

    it("includes only postId filter when only postId is provided", async () => {
      cacheMock.getVersion.mockResolvedValue(2);
      prismaMock.like.findMany.mockResolvedValue([]);

      const params = { postId: 55 };
      await service.findLikes(params);

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: {
          AND: [
            {
              post: {
                is: {
                  removedAt: null,
                },
              },
            },
            { postId: 55 },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: LikeDetailSelect,
      });
    });

    it("includes only userId filter when only userId is provided", async () => {
      cacheMock.getVersion.mockResolvedValue(2);
      prismaMock.like.findMany.mockResolvedValue([]);

      const params = { userId: 77 };
      await service.findLikes(params);

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: {
          AND: [
            {
              post: {
                is: {
                  removedAt: null,
                },
              },
            },
            { userId: 77 },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: LikeDetailSelect,
      });
    });

    it("treats userId 0 as no user filter", async () => {
      cacheMock.getVersion.mockResolvedValue(3);
      prismaMock.like.findMany.mockResolvedValue([]);

      await service.findLikes({ userId: 0 });

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `likes:list:v3:first=${PAGINATION.DEFAULT_TAKE}:after=none:pall:uall:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: {
          post: {
            is: {
              removedAt: null,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: LikeDetailSelect,
      });
    });

    // ✅ NEW: cache hit behavior
    it("returns cached value on cache hit (does not call prisma)", async () => {
      cacheMock.getVersion.mockResolvedValue(1);

      const rows = [makeLike(1)];
      prismaMock.like.findMany.mockResolvedValue(rows);

      const params = { first: 1, postId: 2, userId: 1 };
      await service.findLikes(params);

      prismaMock.like.findMany.mockClear();

      const res = await service.findLikes(params);

      expect(prismaMock.like.findMany).not.toHaveBeenCalled();
      expect(res.items).toEqual(rows);
    });

    it("throws BadRequestException for an invalid cursor", async () => {
      await expect(
        service.findLikes({ first: 5, after: "%%%invalid%%%" }),
      ).rejects.toThrow("Invalid cursor");

      expect(prismaMock.like.findMany).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST like pagination", async () => {
      cacheMock.getVersion.mockResolvedValue(4);
      prismaMock.like.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.findLikes({
        first: 5,
        after,
        orderBy: ChronologicalOrder.OLDEST,
      });

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: 6,
        where: {
          AND: [
            {
              post: {
                is: {
                  removedAt: null,
                },
              },
            },
            {
              OR: [
                { createdAt: { gt: new Date("2026-04-10T00:00:00.000Z") } },
                {
                  createdAt: new Date("2026-04-10T00:00:00.000Z"),
                  id: { gt: 999 },
                },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: LikeDetailSelect,
      });
    });
  });

  describe("getLike", () => {
    it("returns like when found", async () => {
      prismaMock.like.findFirst.mockResolvedValue({
        id: 1,
        userId: 10,
        postId: 20,
      });

      const res = await service.getLike(1);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        "like:detail:1",
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.like.findFirst).toHaveBeenCalledWith({
        where: {
          id: 1,
          post: {
            is: {
              removedAt: null,
            },
          },
        },
        select: LikeDetailSelect,
      });

      expect(res).toEqual({ id: 1, userId: 10, postId: 20 });
    });

    it("throws NotFoundException when like does not exist", async () => {
      prismaMock.like.findFirst.mockResolvedValue(null);

      await expect(service.getLike(123)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("hides likes whose post was moderated away", async () => {
      prismaMock.like.findFirst.mockResolvedValue(null);

      await expect(service.getLike(55)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lets unexpected read errors bubble for the global filter to normalize", async () => {
      prismaMock.like.findFirst.mockRejectedValue(new Error("boom"));

      await expect(service.getLike(1)).rejects.toThrow("boom");
    });
  });

  describe("createLike", () => {
    it("creates like in transaction, bumps/invalidates caches and returns like", async () => {
      const like = makeLike(1);
      prismaMock.$transaction.mockResolvedValue([{ id: 20 }, like]);

      const res = await service.createLike(10, 20);

      expect(prismaMock.post.update.mock.invocationCallOrder[0]).toBeLessThan(
        prismaMock.like.create.mock.invocationCallOrder[0],
      );

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { likesCount: { increment: 1 } },
        select: { id: true },
      });
      expect(prismaMock.like.create).toHaveBeenCalledWith({
        data: { userId: 10, postId: 20 },
        select: LikeDetailSelect,
      });

      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:likes:list");
      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:20");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:2:posts:list");

      expect(res).toEqual(like);
    });

    it("returns like even if notification publish fails", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      const like = makeLike(1);
      prismaMock.$transaction.mockResolvedValue([{ id: 20 }, like]);
      notificationTriggerMock.notifyPostLiked.mockRejectedValue(
        new Error("notify failed"),
      );

      const res = await service.createLike(10, 20);

      expect(res).toEqual(like);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to create like notification for post 20",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it("returns like even if cache invalidation fails after commit", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      const like = makeLike(1);
      prismaMock.$transaction.mockResolvedValue([{ id: 20 }, like]);
      cacheMock.bumpVersion.mockRejectedValueOnce(new Error("cache down"));

      const res = await service.createLike(10, 20);

      expect(res).toEqual(like);
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after creating like for post 20",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it("returns a post payload without commentsCount in the nested post preview", async () => {
      const like = makeLike(1);
      prismaMock.$transaction.mockResolvedValue([{ id: 20 }, like]);

      const res = await service.createLike(10, 20);

      expect(res.post).toEqual({
        id: 11,
        title: "Post 1",
        content: "Content 1",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        likesCount: 1,
        author: {
          id: 1,
          name: "User 1",
          username: "user1",
        },
      });
      expect(res.post).not.toHaveProperty("commentsCount");
    });

    it("throws ConflictException on P2002 (already liked)", async () => {
      const err = new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "test",
      });

      prismaMock.$transaction.mockRejectedValue(err);

      await expect(service.createLike(10, 20)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("throws NotFoundException on P2003/P2025 (post not found)", async () => {
      const err1 = new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      });
      prismaMock.$transaction.mockRejectedValue(err1);

      await expect(service.createLike(10, 20)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const err2 = new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.$transaction.mockRejectedValue(err2);

      await expect(service.createLike(10, 20)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("rejects likes on moderated removed posts", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 20,
        authorId: 2,
        removedAt: new Date("2026-04-10T00:00:00.000Z"),
      });

      await expect(service.createLike(10, 20)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("lets unexpected write errors bubble for the global filter to normalize", async () => {
      prismaMock.$transaction.mockRejectedValue(new Error("boom"));

      await expect(service.createLike(10, 20)).rejects.toThrow("boom");
    });
  });

  describe("deleteLike", () => {
    it("throws NotFoundException when like does not exist", async () => {
      prismaMock.like.findUnique.mockResolvedValue(null);

      await expect(service.deleteLike(1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when current user is not owner", async () => {
      prismaMock.like.findUnique.mockResolvedValue({
        id: 1,
        userId: 999,
        postId: 20,
      });

      await expect(service.deleteLike(1, 10)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("deletes like via transaction, invalidates caches and returns message", async () => {
      prismaMock.like.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        postId: 20,
        post: {
          authorId: 2,
        },
      });

      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            like: { delete: jest.Mock };
            post: { update: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            like: { delete: jest.fn().mockResolvedValue({ id: 1 }) },
            post: { update: jest.fn().mockResolvedValue({ id: 20 }) },
          };

          await cb(tx);

          expect(tx.like.delete).toHaveBeenCalledWith({ where: { id: 1 } });
          expect(tx.post.update).toHaveBeenCalledWith({
            where: { id: 20 },
            data: { likesCount: { decrement: 1 } },
            select: { id: true },
          });

          return undefined;
        },
      );

      const res = await service.deleteLike(1, 10);

      expect(cacheMock.del).toHaveBeenCalledWith("like:detail:1");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:likes:list");
      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:20");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:2:posts:list");

      expect(res).toEqual({ message: "Like deleted successfully" });
    });

    it("throws NotFoundException on Prisma P2025 during transaction (like or post not found)", async () => {
      prismaMock.like.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        postId: 20,
        post: {
          authorId: 2,
        },
      });

      const err = new Prisma.PrismaClientKnownRequestError("gone", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.$transaction.mockRejectedValue(err);

      await expect(service.deleteLike(1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("returns success even if cache invalidation fails after delete", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.like.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        postId: 20,
      });
      prismaMock.$transaction.mockResolvedValue(undefined);
      cacheMock.del.mockRejectedValueOnce(new Error("cache down"));

      await expect(service.deleteLike(1, 10)).resolves.toEqual({
        message: "Like deleted successfully",
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after deleting like 1",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });

    it("lets unexpected delete errors bubble for the global filter to normalize", async () => {
      prismaMock.like.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.deleteLike(1, 10)).rejects.toThrow("boom");
    });
  });
});

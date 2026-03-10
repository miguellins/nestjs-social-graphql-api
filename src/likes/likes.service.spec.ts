import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { LikesService } from "./likes.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { PrismaService } from "@/prisma.service";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { FindLikesArgs } from "@/common/args/find-likes.args";
import { LikeDetailSelect } from "@/likes/dto/like-detail.dto";

describe("LikesService", () => {
  let service: LikesService;

  const prismaMock: {
    like: {
      findMany: jest.Mock;
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

  const notificationsMock: {
    createAndPublishNotification: jest.Mock;
  } = {
    createAndPublishNotification: jest.fn(),
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

    const moduleRef = await Test.createTestingModule({
      providers: [
        LikesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = moduleRef.get(LikesService);
  });

  describe("findLikes", () => {
    it("builds cache key with version/take/filters and queries prisma with correct where/select", async () => {
      cacheMock.getVersion.mockResolvedValue(9);
      prismaMock.like.findMany.mockResolvedValue([
        { id: 1, userId: 10, postId: 20 },
      ]);

      const params: FindLikesArgs = {
        take: PAGINATION.MAX_TAKE + 999,
        postId: 20,
        userId: 10,
      };
      const res = await service.findLikes(params);

      const expectedTake = PAGINATION.MAX_TAKE;

      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:likes:list");
      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `likes:list:v9:${expectedTake}:p20:u10`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: expectedTake,
        where: { postId: 20, userId: 10 },
        orderBy: { createdAt: "desc" },
        select: LikeDetailSelect,
      });

      expect(res).toEqual([{ id: 1, userId: 10, postId: 20 }]);
    });

    it("omits where filters when postId/userId are not provided and uses defaults", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.like.findMany.mockResolvedValue([]);

      await service.findLikes(undefined);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `likes:list:v1:${PAGINATION.DEFAULT_TAKE}:pall:uall`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        where: {},
        orderBy: { createdAt: "desc" },
        select: LikeDetailSelect,
      });
    });

    it("includes only postId filter when only postId is provided", async () => {
      cacheMock.getVersion.mockResolvedValue(2);
      prismaMock.like.findMany.mockResolvedValue([]);

      const params: FindLikesArgs = { postId: 55 };
      await service.findLikes(params);

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        where: { postId: 55 },
        orderBy: { createdAt: "desc" },
        select: LikeDetailSelect,
      });
    });

    it("includes only userId filter when only userId is provided", async () => {
      cacheMock.getVersion.mockResolvedValue(2);
      prismaMock.like.findMany.mockResolvedValue([]);

      const params: FindLikesArgs = { userId: 77 };
      await service.findLikes(params);

      expect(prismaMock.like.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        where: { userId: 77 },
        orderBy: { createdAt: "desc" },
        select: LikeDetailSelect,
      });
    });

    // ✅ NEW: cache hit behavior
    it("returns cached value on cache hit (does not call prisma)", async () => {
      cacheMock.getVersion.mockResolvedValue(1);

      prismaMock.like.findMany.mockResolvedValue([
        { id: 99, userId: 1, postId: 2 },
      ]);

      const params: FindLikesArgs = { take: 1, postId: 2, userId: 1 };
      await service.findLikes(params);

      prismaMock.like.findMany.mockClear();

      const res = await service.findLikes(params);

      expect(prismaMock.like.findMany).not.toHaveBeenCalled();
      expect(res).toEqual([{ id: 99, userId: 1, postId: 2 }]);
    });
  });

  describe("getLike", () => {
    it("returns like when found", async () => {
      prismaMock.like.findUnique.mockResolvedValue({
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

      expect(prismaMock.like.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: LikeDetailSelect,
      });

      expect(res).toEqual({ id: 1, userId: 10, postId: 20 });
    });

    it("throws NotFoundException when like does not exist", async () => {
      prismaMock.like.findUnique.mockResolvedValue(null);

      await expect(service.getLike(123)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("wraps unexpected errors as InternalServerErrorException", async () => {
      prismaMock.like.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.getLike(1)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe("createLike", () => {
    it("creates like in transaction, bumps/invalidates caches and returns like", async () => {
      const like = { id: 1, userId: 10, postId: 20 };
      prismaMock.$transaction.mockResolvedValue([like, { id: 20 }]);

      const res = await service.createLike(10, 20);

      expect(prismaMock.like.create).toHaveBeenCalledWith({
        data: { userId: 10, postId: 20 },
        select: LikeDetailSelect,
      });
      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 20 },
        data: { likesCount: { increment: 1 } },
        select: { id: true },
      });

      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:likes:list");
      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:20");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:10");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual(like);
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

    it("throws InternalServerErrorException for unknown errors", async () => {
      prismaMock.$transaction.mockRejectedValue(new Error("boom"));

      await expect(service.createLike(10, 20)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
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
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:10");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual({ message: "Like deleted successfully" });
    });

    it("throws NotFoundException on Prisma P2025 during transaction (like or post not found)", async () => {
      prismaMock.like.findUnique.mockResolvedValue({
        id: 1,
        userId: 10,
        postId: 20,
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

    it("throws InternalServerErrorException for unknown errors", async () => {
      prismaMock.like.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.deleteLike(1, 10)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});

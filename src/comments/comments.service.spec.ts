import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { SafeCommentSelect } from "@/comments/dto/safe-comment.dto";

import { PrismaService } from "@/prisma.service";

import { CommentsService } from "./comments.service";

describe("CommentsService", () => {
  let service: CommentsService;
  let moduleRef: TestingModule;

  const prismaMock: {
    post: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    comment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    comment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cacheMock: {
    del: jest.Mock;
  } = {
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
      ],
    }).compile();

    service = moduleRef.get(CommentsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("createComment", () => {
    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(
        service.createComment({ content: "hello", postId: 1 }, 10),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("creates comment in transaction, increments counter and invalidates cache", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });

      const created = {
        id: 99,
        content: "hello",
        authorId: 10,
        postId: 1,
      };

      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { create: jest.Mock };
            post: { update: jest.Mock };
          }) => Promise<unknown>,
        ) => {
          const tx = {
            comment: {
              create: jest.fn().mockResolvedValue(created),
            },
            post: {
              update: jest.fn().mockResolvedValue({ id: 1 }),
            },
          };

          const result = await cb(tx);

          expect(tx.comment.create).toHaveBeenCalledWith({
            data: {
              content: "hello",
              postId: 1,
              authorId: 10,
            },
            select: SafeCommentSelect,
          });

          expect(tx.post.update).toHaveBeenCalledWith({
            where: { id: 1 },
            data: {
              commentsCount: {
                increment: 1,
              },
            },
          });

          return result;
        },
      );

      const res = await service.createComment(
        { content: "hello", postId: 1 },
        10,
      );

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:1");
      expect(res).toEqual(created);
    });
  });

  describe("findCommentsByPost", () => {
    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(
        service.findCommentsByPost({ postId: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("uses pagination defaults when take is not provided", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.comment.findMany.mockResolvedValue([]);

      await service.findCommentsByPost({ postId: 1 });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        where: { postId: 1 },
        orderBy: { createdAt: "desc" },
        select: SafeCommentSelect,
      });
    });

    it("caps take to max pagination value", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.comment.findMany.mockResolvedValue([]);

      await service.findCommentsByPost({
        postId: 1,
        take: PAGINATION.MAX_TAKE + 100,
      });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        take: PAGINATION.MAX_TAKE,
        where: { postId: 1 },
        orderBy: { createdAt: "desc" },
        select: SafeCommentSelect,
      });
    });
  });

  describe("deleteComment", () => {
    it("throws NotFoundException when comment does not exist", async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      await expect(service.deleteComment(1, 10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when current user is not owner", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 999,
        postId: 3,
      });

      await expect(service.deleteComment(1, 10)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("deletes comment in transaction, decrements counter, invalidates cache and returns message", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 10,
        postId: 3,
      });

      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { delete: jest.Mock };
            post: { update: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            comment: {
              delete: jest.fn().mockResolvedValue({ id: 1 }),
            },
            post: {
              update: jest.fn().mockResolvedValue({ id: 3 }),
            },
          };

          await cb(tx);

          expect(tx.comment.delete).toHaveBeenCalledWith({ where: { id: 1 } });
          expect(tx.post.update).toHaveBeenCalledWith({
            where: { id: 3 },
            data: {
              commentsCount: {
                decrement: 1,
              },
            },
          });

          return undefined;
        },
      );

      const res = await service.deleteComment(1, 10);

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:3");
      expect(res).toEqual({ message: "Comment deleted successfully" });
    });
  });
});

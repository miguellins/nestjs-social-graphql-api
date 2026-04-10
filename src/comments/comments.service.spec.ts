import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { Prisma } from "@prisma/client";

import { SafeCommentSelect } from "@/comments/dto/safe-comment.dto";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";

import { PrismaService } from "@/prisma/prisma.service";

import { CommentsService } from "./comments.service";

describe("CommentsService", () => {
  let service: CommentsService;
  let moduleRef: TestingModule;
  const makeComment = (id: number) => ({
    id,
    content: `Comment ${id}`,
    createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
    updatedAt: new Date(`2026-04-0${id}T01:00:00.000Z`),
    authorId: id,
    postId: 1,
    author: {
      id,
      name: `User ${id}`,
      username: `user${id}`,
    },
  });

  const prismaMock: {
    post: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    contentReport: {
      updateMany: jest.Mock;
    };
    moderationAction: {
      create: jest.Mock;
    };
    comment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    post: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    contentReport: {
      updateMany: jest.fn(),
    },
    moderationAction: {
      create: jest.fn(),
    },
    comment: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cacheMock: {
    del: jest.Mock;
    bumpVersion: jest.Mock;
  } = {
    del: jest.fn(),
    bumpVersion: jest.fn(),
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
    it("throws BadRequestException when content is empty after trim", async () => {
      await expect(
        service.createComment({ content: "   ", postId: 1 }, 10),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.findUnique).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(
        service.createComment({ content: "hello", postId: 1 }, 10),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("creates comment in transaction, increments counter and invalidates cache", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 7 });

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
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
      expect(res).toEqual(created);
    });

    it("returns the created comment even if cache invalidation fails", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 7 });
      prismaMock.$transaction.mockResolvedValue({
        id: 99,
        content: "hello",
        authorId: 10,
        postId: 1,
      });
      cacheMock.del.mockRejectedValueOnce(new Error("cache down"));

      await expect(
        service.createComment({ content: "hello", postId: 1 }, 10),
      ).resolves.toEqual({
        id: 99,
        content: "hello",
        authorId: 10,
        postId: 1,
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after creating comment on post 1",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe("findCommentsByPost", () => {
    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(
        service.findCommentsByPost({ postId: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("uses cursor pagination defaults when first is not provided", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.comment.findMany.mockResolvedValue([]);

      await service.findCommentsByPost({ postId: 1 });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: { postId: 1, removedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafeCommentSelect,
      });
    });

    it("caps first to max pagination value", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.comment.findMany.mockResolvedValue([]);

      await service.findCommentsByPost({
        postId: 1,
        first: PAGINATION.MAX_TAKE + 100,
      });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        take: PAGINATION.MAX_TAKE + 1,
        where: { postId: 1, removedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafeCommentSelect,
      });
    });

    it("returns a page and applies the cursor filter", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });
      const rows = [makeComment(3), makeComment(2), makeComment(1)];
      prismaMock.comment.findMany.mockResolvedValue(rows);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      const result = await service.findCommentsByPost({
        postId: 1,
        first: 5,
        after,
      });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        take: 6,
        where: {
          AND: [
            { postId: 1 },
            { removedAt: null },
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
        select: SafeCommentSelect,
      });

      expect(result.items).toEqual(rows);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toBeDefined();
    });

    it("throws BadRequestException for an invalid cursor", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        service.findCommentsByPost({
          postId: 1,
          first: 5,
          after: "%%%invalid%%%",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.comment.findMany).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST comment pagination", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1 });
      prismaMock.comment.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.findCommentsByPost({
        postId: 1,
        first: 5,
        after,
        orderBy: ChronologicalOrder.OLDEST,
      });

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        take: 6,
        where: {
          AND: [
            { postId: 1 },
            { removedAt: null },
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
        select: SafeCommentSelect,
      });
    });

    it("hides moderated comments from commentsByPost", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 1,
        removedAt: null,
      });
      const visibleRows = [makeComment(2), makeComment(1)];
      prismaMock.comment.findMany.mockResolvedValue(visibleRows);

      const result = await service.findCommentsByPost({ postId: 1 });

      expect(result.items).toEqual(visibleRows);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toEqual(expect.any(String));

      expect(prismaMock.comment.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: { postId: 1, removedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
        post: {
          authorId: 7,
        },
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
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
      expect(res).toEqual({ message: "Comment deleted successfully" });
    });

    it("returns success even if cache invalidation fails after delete", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 10,
        postId: 3,
        post: {
          authorId: 7,
        },
      });
      prismaMock.$transaction.mockResolvedValue(undefined);
      cacheMock.del.mockRejectedValueOnce(new Error("cache down"));

      await expect(service.deleteComment(1, 10)).resolves.toEqual({
        message: "Comment deleted successfully",
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after deleting comment 1",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe("removeCommentByModerator", () => {
    it("removes a comment, decrements the counter, logs the action, and invalidates caches", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        postId: 3,
        removedAt: null,
        post: {
          authorId: 7,
        },
      });

      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { updateMany: jest.Mock };
            post: { update: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            comment: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            post: {
              update: jest.fn().mockResolvedValue({ id: 3 }),
            },
            contentReport: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            moderationAction: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
            },
          };

          await cb(tx);

          expect(tx.comment.updateMany).toHaveBeenCalledWith({
            where: { id: 1, removedAt: null },
            data: {
              removedAt: expect.any(Date) as Date,
              removedById: 3,
              removalReason: "abuse",
            },
          });
          expect(tx.post.update).toHaveBeenCalledWith({
            where: { id: 3 },
            data: {
              commentsCount: {
                decrement: 1,
              },
            },
          });
          expect(tx.contentReport.updateMany).toHaveBeenCalledWith({
            where: {
              id: 77,
              commentId: 1,
              status: "OPEN",
            },
            data: {
              status: "ACTIONED",
            },
          });
          expect(tx.moderationAction.create).toHaveBeenCalledWith({
            data: {
              actorId: 3,
              actionType: "REMOVE_COMMENT",
              targetType: "COMMENT",
              targetId: 1,
              reason: "abuse",
              reportId: 77,
              commentId: 1,
            },
          });
        },
      );

      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "  abuse  ", reportId: 77 },
          { id: 3, role: "MODERATOR" },
        ),
      ).resolves.toEqual({
        message: "Comment removed successfully",
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:3");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
    });

    it("rejects normal users", async () => {
      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "abuse" },
          { id: 3, role: "USER" },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("throws NotFoundException when target comment does not exist", async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "abuse" },
          { id: 3, role: "ADMIN" },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws BadRequestException when comment is already removed", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        postId: 3,
        removedAt: new Date("2026-04-09T12:00:00.000Z"),
        post: {
          authorId: 7,
        },
      });

      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "abuse" },
          { id: 3, role: "ADMIN" },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("allows admins to remove a comment", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        postId: 3,
        removedAt: null,
        post: {
          authorId: 7,
        },
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { updateMany: jest.Mock };
            post: { update: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            comment: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            post: {
              update: jest.fn().mockResolvedValue({ id: 3 }),
            },
            moderationAction: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
            },
          };

          await cb(tx as never);
        },
      );

      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "policy violation" },
          { id: 9, role: "ADMIN" },
        ),
      ).resolves.toEqual({
        message: "Comment removed successfully",
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:3");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
    });

    it("does not require a report id", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        postId: 3,
        removedAt: null,
        post: {
          authorId: 7,
        },
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { updateMany: jest.Mock };
            post: { update: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            comment: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            post: {
              update: jest.fn().mockResolvedValue({ id: 3 }),
            },
            contentReport: {
              updateMany: jest.fn(),
            },
            moderationAction: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
            },
          };

          await cb(tx);

          expect(tx.contentReport.updateMany).not.toHaveBeenCalled();
          expect(tx.post.update).toHaveBeenCalledWith({
            where: { id: 3 },
            data: {
              commentsCount: {
                decrement: 1,
              },
            },
          });
        },
      );

      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "abuse" },
          { id: 3, role: "MODERATOR" },
        ),
      ).resolves.toEqual({
        message: "Comment removed successfully",
      });
    });

    it("rejects a linked report that is not open for the comment", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        postId: 3,
        removedAt: null,
        post: {
          authorId: 7,
        },
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { updateMany: jest.Mock };
            post: { update: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            comment: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            post: {
              update: jest.fn().mockResolvedValue({ id: 3 }),
            },
            contentReport: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            moderationAction: {
              create: jest.fn(),
            },
          };

          await cb(tx);
        },
      );

      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "abuse", reportId: 77 },
          { id: 3, role: "MODERATOR" },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a concurrent second moderation removal without decrementing comments twice", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        postId: 3,
        removedAt: null,
        post: {
          authorId: 7,
        },
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { updateMany: jest.Mock };
            post: { update: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            comment: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            post: {
              update: jest.fn(),
            },
            contentReport: {
              updateMany: jest.fn(),
            },
            moderationAction: {
              create: jest.fn(),
            },
          };

          await cb(tx);
          expect(tx.post.update).not.toHaveBeenCalled();
          expect(tx.moderationAction.create).not.toHaveBeenCalled();
        },
      );

      await expect(
        service.removeCommentByModerator(
          { commentId: 1, reason: "abuse" },
          { id: 3, role: "MODERATOR" },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("updateComment", () => {
    it("throws BadRequestException when content is empty after trim", async () => {
      await expect(
        service.updateComment(1, { content: "   " }, 10),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.comment.findUnique).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when comment does not exist", async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.updateComment(1, { content: "hello" }, 10),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ForbiddenException when current user is not owner", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 999,
        postId: 3,
      });

      await expect(
        service.updateComment(1, { content: "hello" }, 10),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("updates the comment, invalidates post detail cache, and returns the safe comment", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 10,
        postId: 3,
      });
      prismaMock.comment.update.mockResolvedValue({
        id: 1,
        content: "updated",
        postId: 3,
        authorId: 10,
      });

      const res = await service.updateComment(1, { content: " updated " }, 10);

      expect(prismaMock.comment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { content: "updated" },
        select: SafeCommentSelect,
      });
      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:3");
      expect(cacheMock.bumpVersion).not.toHaveBeenCalled();
      expect(res).toEqual({
        id: 1,
        content: "updated",
        postId: 3,
        authorId: 10,
      });
    });

    it("throws NotFoundException on Prisma P2025 during update", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 10,
        postId: 3,
      });
      prismaMock.comment.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("missing", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      await expect(
        service.updateComment(1, { content: "hello" }, 10),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws InternalServerErrorException for unexpected update errors", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 10,
        postId: 3,
      });
      prismaMock.comment.update.mockRejectedValue(new Error("boom"));

      await expect(
        service.updateComment(1, { content: "hello" }, 10),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("returns the updated comment even if cache invalidation fails", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 10,
        postId: 3,
      });
      prismaMock.comment.update.mockResolvedValue({
        id: 1,
        content: "updated",
        postId: 3,
        authorId: 10,
      });
      cacheMock.del.mockRejectedValueOnce(new Error("cache down"));

      await expect(
        service.updateComment(1, { content: "updated" }, 10),
      ).resolves.toEqual({
        id: 1,
        content: "updated",
        postId: 3,
        authorId: 10,
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after updating comment 1",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });
  });
});

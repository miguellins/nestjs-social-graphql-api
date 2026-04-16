import {
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { CommentsReadService } from "@/comments/comments-read.service";
import { SafeCommentSelect } from "@/comments/dto/safe-comment.dto";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";

import { AccountState } from "@/users/enums/account-state.enum";

import { CommentsService } from "./comments.service";

describe("CommentsService", () => {
  let service: CommentsService;
  let moduleRef: TestingModule;

  const makeComment = (
    id: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    content: `Comment ${id}`,
    createdAt: new Date(`2026-04-0${Math.min(id, 9)}T00:00:00.000Z`),
    updatedAt: new Date(`2026-04-0${Math.min(id, 9)}T01:00:00.000Z`),
    authorId: id,
    postId: 1,
    parentCommentId: null,
    author: {
      id,
      name: `User ${id}`,
      username: `user${id}`,
    },
    ...overrides,
  });

  const prismaMock = {
    post: {
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    contentReport: {
      updateMany: jest.fn(),
    },
    moderationAction: {
      create: jest.fn(),
    },
    comment: {
      count: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cacheMock = {
    del: jest.fn(),
    bumpVersion: jest.fn(),
  };

  const commentsReadServiceMock = {
    findCommentsByPost: jest.fn(),
    getReadablePostOrThrow: jest.fn(),
  };

  const notificationTriggerMock = {
    notifyCommentReplied: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    prismaMock.comment.count.mockResolvedValue(0);
    commentsReadServiceMock.getReadablePostOrThrow.mockResolvedValue({
      id: 1,
      authorId: 7,
      removedAt: null,
      author: {
        accountState: AccountState.ACTIVE,
        privacySetting: "PUBLIC",
      },
    });
    notificationTriggerMock.notifyCommentReplied.mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: CommentsReadService, useValue: commentsReadServiceMock },
        {
          provide: NotificationTriggerService,
          useValue: notificationTriggerMock,
        },
      ],
    }).compile();

    service = moduleRef.get(CommentsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("createComment", () => {
    it("rejects blank content before touching reads", async () => {
      await expect(
        service.createComment({ content: "   ", postId: 1 }, 10),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(
        commentsReadServiceMock.getReadablePostOrThrow,
      ).not.toHaveBeenCalled();
    });

    it("creates a top-level comment and invalidates the related caches", async () => {
      const created = makeComment(99, {
        authorId: 10,
        author: {
          id: 10,
          name: "User 10",
          username: "user10",
        },
      });

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
              parentCommentId: undefined,
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

      await expect(
        service.createComment({ content: "hello", postId: 1 }, 10),
      ).resolves.toEqual({
        ...created,
        repliesCount: 0,
        replies: [],
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:1");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
      expect(
        notificationTriggerMock.notifyCommentReplied,
      ).not.toHaveBeenCalled();
    });

    it("rejects replies that target another reply", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 20,
        postId: 1,
        removedAt: null,
        parentCommentId: 10,
        authorId: 7,
      });

      await expect(
        service.createComment(
          { content: "reply", postId: 1, parentCommentId: 20 },
          10,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects replies when the parent comment does not exist", async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.createComment(
          { content: "reply", postId: 1, parentCommentId: 20 },
          10,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects replies when the parent comment was removed", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 20,
        postId: 1,
        removedAt: new Date("2026-04-01T00:00:00.000Z"),
        parentCommentId: null,
        authorId: 7,
      });

      await expect(
        service.createComment(
          { content: "reply", postId: 1, parentCommentId: 20 },
          10,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects replies when the parent belongs to another post", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 20,
        postId: 2,
        removedAt: null,
        parentCommentId: null,
        authorId: 7,
      });

      await expect(
        service.createComment(
          { content: "reply", postId: 1, parentCommentId: 20 },
          10,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("creates a reply, increments the post comments count, and invalidates caches", async () => {
      const created = makeComment(101, {
        authorId: 10,
        parentCommentId: 20,
        author: {
          id: 10,
          name: "User 10",
          username: "user10",
        },
      });

      prismaMock.comment.findUnique.mockResolvedValue({
        id: 20,
        postId: 1,
        removedAt: null,
        parentCommentId: null,
        authorId: 7,
      });
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ accountState: AccountState.ACTIVE })
        .mockResolvedValueOnce({ username: "user10" });
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
              content: "reply",
              postId: 1,
              authorId: 10,
              parentCommentId: 20,
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

      await expect(
        service.createComment(
          { content: "reply", postId: 1, parentCommentId: 20 },
          10,
        ),
      ).resolves.toEqual({
        ...created,
        repliesCount: 0,
        replies: [],
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:1");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
    });

    it("creates a reply notification for the parent comment author", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 20,
        postId: 1,
        removedAt: null,
        parentCommentId: null,
        authorId: 7,
      });
      prismaMock.user.findUnique
        .mockResolvedValueOnce({ accountState: AccountState.ACTIVE })
        .mockResolvedValueOnce({ username: "user10" });
      prismaMock.$transaction.mockResolvedValue(
        makeComment(101, {
          authorId: 10,
          parentCommentId: 20,
          author: {
            id: 10,
            name: "User 10",
            username: "user10",
          },
        }),
      );

      await service.createComment(
        { content: "reply", postId: 1, parentCommentId: 20 },
        10,
      );

      expect(notificationTriggerMock.notifyCommentReplied).toHaveBeenCalledWith(
        {
          recipientId: 7,
          actorId: 10,
          actorUsername: "user10",
          commentId: 101,
        },
      );
    });

    it("does not notify when a user replies to their own comment", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 20,
        postId: 1,
        removedAt: null,
        parentCommentId: null,
        authorId: 10,
      });
      prismaMock.$transaction.mockResolvedValue(
        makeComment(101, {
          authorId: 10,
          parentCommentId: 20,
          author: {
            id: 10,
            name: "User 10",
            username: "user10",
          },
        }),
      );

      await service.createComment(
        { content: "reply", postId: 1, parentCommentId: 20 },
        10,
      );

      expect(
        notificationTriggerMock.notifyCommentReplied,
      ).not.toHaveBeenCalled();
    });

    it("propagates post visibility failures before creating a reply", async () => {
      commentsReadServiceMock.getReadablePostOrThrow.mockRejectedValueOnce(
        new NotFoundException("Post not found"),
      );

      await expect(
        service.createComment(
          { content: "reply", postId: 1, parentCommentId: 20 },
          10,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prismaMock.comment.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    });

    it("returns the created comment even if cache invalidation fails", async () => {
      const loggerErrorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      prismaMock.$transaction.mockResolvedValue(
        makeComment(99, {
          authorId: 10,
          author: {
            id: 10,
            name: "User 10",
            username: "user10",
          },
        }),
      );
      cacheMock.del.mockRejectedValueOnce(new Error("cache down"));

      await expect(
        service.createComment({ content: "hello", postId: 1 }, 10),
      ).resolves.toMatchObject({
        id: 99,
        content: "Comment 99",
        repliesCount: 0,
        replies: [],
      });

      expect(loggerErrorSpy).toHaveBeenCalledWith(
        "Failed to invalidate caches after creating comment on post 1",
        expect.any(String),
      );

      loggerErrorSpy.mockRestore();
    });
  });

  describe("findCommentsByPost", () => {
    it("delegates threaded reads to CommentsReadService", async () => {
      commentsReadServiceMock.findCommentsByPost.mockResolvedValue({
        items: [
          {
            ...makeComment(1),
            repliesCount: 0,
            replies: [],
          },
        ],
        pageInfo: { endCursor: "cursor", hasNextPage: false },
      });

      const result = await service.findCommentsByPost({
        postId: 1,
        first: 5,
        after: "cursor",
      });

      expect(commentsReadServiceMock.findCommentsByPost).toHaveBeenCalledWith({
        after: "cursor",
        first: 5,
        postId: 1,
        orderBy: undefined,
        viewerId: undefined,
      });
      expect(result.pageInfo.endCursor).toBe("cursor");
    });
  });

  describe("updateComment", () => {
    it("updates one owned reply and keeps the threaded mutation shape", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 10,
        authorId: 7,
        postId: 3,
        removedAt: null,
      });
      prismaMock.comment.update.mockResolvedValue(
        makeComment(10, {
          authorId: 7,
          postId: 3,
          parentCommentId: 1,
        }),
      );

      await expect(
        service.updateComment(10, { content: "updated" }, 7),
      ).resolves.toEqual({
        ...makeComment(10, {
          authorId: 7,
          postId: 3,
          parentCommentId: 1,
        }),
        repliesCount: 0,
        replies: [],
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:3");
    });

    it("rejects non-owners from updating replies", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 99,
        postId: 3,
        removedAt: null,
      });

      await expect(
        service.updateComment(1, { content: "updated" }, 10),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("deleteComment", () => {
    it("deletes a top-level thread and decrements the post counter by thread size", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 1,
        authorId: 10,
        postId: 3,
        parentCommentId: null,
        removedAt: null,
        post: {
          authorId: 7,
        },
      });
      prismaMock.comment.count.mockResolvedValue(2);

      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            comment: { deleteMany: jest.Mock; delete: jest.Mock };
            post: { update: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            comment: {
              deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
              delete: jest.fn().mockResolvedValue({ id: 1 }),
            },
            post: {
              update: jest.fn().mockResolvedValue({ id: 3 }),
            },
          };

          await cb(tx);

          expect(tx.comment.deleteMany).toHaveBeenCalledWith({
            where: {
              parentCommentId: 1,
            },
          });
          expect(tx.comment.delete).toHaveBeenCalledWith({
            where: { id: 1 },
          });
          expect(tx.post.update).toHaveBeenCalledWith({
            where: { id: 3 },
            data: {
              commentsCount: {
                decrement: 3,
              },
            },
          });
        },
      );

      await expect(service.deleteComment(1, 10)).resolves.toEqual({
        message: "Comment deleted successfully",
      });
    });
  });

  describe("removeCommentByModerator", () => {
    it("removes an entire top-level thread from normal reads", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({
        id: 10,
        postId: 3,
        parentCommentId: null,
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
              updateMany: jest.fn().mockResolvedValue({ count: 3 }),
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
            where: {
              OR: [{ id: 10 }, { parentCommentId: 10 }],
              removedAt: null,
            },
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
                decrement: 3,
              },
            },
          });
        },
      );

      await expect(
        service.removeCommentByModerator(
          { commentId: 10, reason: "abuse", reportId: 77 },
          { id: 3, role: "MODERATOR" },
        ),
      ).resolves.toEqual({
        message: "Comment removed successfully",
      });
    });
  });
});

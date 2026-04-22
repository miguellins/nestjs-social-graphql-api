import { Test, TestingModule } from "@nestjs/testing";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";
import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

import { MentionsService } from "./mentions.service";

describe("MentionsService", () => {
  let service: MentionsService;
  let moduleRef: TestingModule;

  const prismaMock = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
    },
    postMention: {
      findMany: jest.fn(),
    },
    commentMention: {
      findMany: jest.fn(),
    },
    userBlock: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    follow: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const notificationTriggerMock = {
    notifyPostMentioned: jest.fn(),
    notifyCommentMentioned: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.user.findUnique.mockResolvedValue({
      username: "actor",
    });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.postMention.findMany.mockResolvedValue([]);
    prismaMock.commentMention.findMany.mockResolvedValue([]);
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    prismaMock.follow.findUnique.mockResolvedValue(null);
    prismaMock.follow.findMany.mockResolvedValue([]);
    notificationTriggerMock.notifyPostMentioned.mockResolvedValue(undefined);
    notificationTriggerMock.notifyCommentMentioned.mockResolvedValue(undefined);
    prismaMock.$transaction.mockImplementation(
      async (
        cb: (tx: {
          postMention: { deleteMany: jest.Mock; createMany: jest.Mock };
          commentMention: { deleteMany: jest.Mock; createMany: jest.Mock };
        }) => Promise<unknown>,
      ) =>
        cb({
          postMention: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          commentMention: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        }),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        MentionsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: NotificationTriggerService,
          useValue: notificationTriggerMock,
        },
      ],
    }).compile();

    service = moduleRef.get(MentionsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("persists self-mentions but does not notify them on post create", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 7, username: "actor" },
      { id: 8, username: "alice" },
    ]);
    prismaMock.post.findUnique.mockResolvedValue({
      id: 20,
      authorId: 7,
      removedAt: null,
      author: {
        accountState: AccountState.ACTIVE,
        privacySetting: UserPrivacySetting.PUBLIC,
      },
    });

    await service.syncPostMentions({
      postId: 20,
      actorId: 7,
      content: "hello @actor and @alice",
    });

    expect(prismaMock.postMention.findMany).toHaveBeenCalledWith({
      where: { postId: 20 },
      select: {
        mentionedUserId: true,
      },
    });
    expect(notificationTriggerMock.notifyPostMentioned).toHaveBeenCalledTimes(
      1,
    );
    expect(notificationTriggerMock.notifyPostMentioned).toHaveBeenCalledWith({
      recipientId: 8,
      actorId: 7,
      actorUsername: "actor",
      postId: 20,
    });
  });

  it("suppresses post mention notifications when the recipient cannot read the post", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 9, username: "alice" }]);
    prismaMock.post.findUnique.mockResolvedValue({
      id: 21,
      authorId: 3,
      removedAt: null,
      author: {
        accountState: AccountState.ACTIVE,
        privacySetting: UserPrivacySetting.PRIVATE,
      },
    });
    prismaMock.follow.findMany.mockResolvedValue([]);

    await service.syncPostMentions({
      postId: 21,
      actorId: 7,
      content: "hello @alice",
    });

    expect(notificationTriggerMock.notifyPostMentioned).not.toHaveBeenCalled();
  });

  it("batches post mention visibility checks instead of querying per recipient", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: 8, username: "alice" },
      { id: 9, username: "bob" },
    ]);
    prismaMock.post.findUnique.mockResolvedValue({
      id: 20,
      authorId: 7,
      removedAt: null,
      author: {
        accountState: AccountState.ACTIVE,
        privacySetting: UserPrivacySetting.PRIVATE,
      },
    });
    prismaMock.userBlock.findMany.mockResolvedValue([
      { blockerId: 9, blockedId: 7 },
    ]);
    prismaMock.follow.findMany.mockResolvedValue([{ followerId: 8 }]);

    await service.syncPostMentions({
      postId: 20,
      actorId: 7,
      content: "hello @alice and @bob",
    });

    expect(prismaMock.userBlock.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.follow.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.userBlock.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.follow.findUnique).not.toHaveBeenCalled();
    expect(notificationTriggerMock.notifyPostMentioned).toHaveBeenCalledTimes(
      1,
    );
    expect(notificationTriggerMock.notifyPostMentioned).toHaveBeenCalledWith({
      recipientId: 8,
      actorId: 7,
      actorUsername: "actor",
      postId: 20,
    });
  });

  it("notifies newly added comment mentions again when they are re-added on later edits", async () => {
    prismaMock.user.findMany.mockResolvedValue([{ id: 8, username: "alice" }]);
    prismaMock.commentMention.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ mentionedUserId: 8 }])
      .mockResolvedValueOnce([]);
    prismaMock.comment.findUnique.mockResolvedValue({
      removedAt: null,
      post: {
        id: 55,
        authorId: 7,
        removedAt: null,
        author: {
          accountState: AccountState.ACTIVE,
          privacySetting: UserPrivacySetting.PUBLIC,
        },
      },
    });

    await service.syncCommentMentions({
      commentId: 55,
      actorId: 7,
      content: "hello @alice",
    });

    await service.syncCommentMentions({
      commentId: 55,
      actorId: 7,
      content: "hello there",
    });

    await service.syncCommentMentions({
      commentId: 55,
      actorId: 7,
      content: "welcome back @alice",
    });

    expect(
      notificationTriggerMock.notifyCommentMentioned,
    ).toHaveBeenCalledTimes(2);
  });
});

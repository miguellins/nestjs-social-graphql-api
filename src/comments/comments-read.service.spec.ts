import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";

import { PrismaService } from "@/prisma/prisma.service";
import { SafeCommentSelect } from "@/comments/dto/safe-comment.dto";
import { MutesService } from "@/mutes/mutes.service";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

import { CommentsReadService } from "./comments-read.service";

describe("CommentsReadService", () => {
  let service: CommentsReadService;
  let moduleRef: TestingModule;

  const makeComment = (
    id: number,
    overrides: Record<string, unknown> = {},
  ) => ({
    id,
    content: `Comment ${id}`,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T01:00:00.000Z"),
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
    user: {
      findUnique: jest.fn(),
    },
    post: {
      findUnique: jest.fn(),
    },
    userBlock: {
      findFirst: jest.fn(),
    },
    follow: {
      findUnique: jest.fn(),
    },
    comment: {
      findMany: jest.fn(),
    },
  };

  const mutesServiceMock = {
    getMutedUserIdsForScope: jest.fn(),
    isMutedForScope: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    prismaMock.post.findUnique.mockResolvedValue({
      id: 1,
      authorId: 7,
      removedAt: null,
      author: {
        accountState: AccountState.ACTIVE,
        privacySetting: UserPrivacySetting.PUBLIC,
      },
    });
    prismaMock.userBlock.findFirst.mockResolvedValue(null);
    prismaMock.follow.findUnique.mockResolvedValue({ id: 1 });
    mutesServiceMock.getMutedUserIdsForScope.mockResolvedValue([]);
    mutesServiceMock.isMutedForScope.mockResolvedValue(false);

    moduleRef = await Test.createTestingModule({
      providers: [
        CommentsReadService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: MutesService, useValue: mutesServiceMock },
      ],
    }).compile();

    service = moduleRef.get(CommentsReadService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("returns only top-level comments and nests bounded oldest-first replies", async () => {
    prismaMock.comment.findMany
      .mockResolvedValueOnce([makeComment(30), makeComment(20)])
      .mockResolvedValueOnce([
        makeComment(201, {
          parentCommentId: 20,
          createdAt: new Date("2026-04-20T00:00:00.000Z"),
        }),
        makeComment(202, {
          parentCommentId: 20,
          createdAt: new Date("2026-04-20T00:01:00.000Z"),
        }),
        makeComment(203, {
          parentCommentId: 20,
          createdAt: new Date("2026-04-20T00:02:00.000Z"),
        }),
        makeComment(204, {
          parentCommentId: 20,
          createdAt: new Date("2026-04-20T00:03:00.000Z"),
        }),
        makeComment(301, {
          parentCommentId: 30,
          createdAt: new Date("2026-04-30T00:01:00.000Z"),
        }),
      ]);

    const result = await service.findCommentsByPost({
      postId: 1,
      first: 2,
      orderBy: ChronologicalOrder.NEWEST,
      viewerId: 99,
    });

    expect(prismaMock.comment.findMany).toHaveBeenNthCalledWith(1, {
      take: 3,
      where: {
        postId: 1,
        parentCommentId: null,
        removedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SafeCommentSelect,
    });
    expect(prismaMock.comment.findMany).toHaveBeenNthCalledWith(2, {
      where: {
        parentCommentId: { in: [30, 20] },
        removedAt: null,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: SafeCommentSelect,
    });

    expect(result.items).toEqual([
      {
        ...makeComment(30),
        repliesCount: 1,
        replies: [
          {
            ...makeComment(301, {
              parentCommentId: 30,
              createdAt: new Date("2026-04-30T00:01:00.000Z"),
            }),
          },
        ],
      },
      {
        ...makeComment(20),
        repliesCount: 4,
        replies: [
          {
            ...makeComment(201, {
              parentCommentId: 20,
              createdAt: new Date("2026-04-20T00:00:00.000Z"),
            }),
          },
          {
            ...makeComment(202, {
              parentCommentId: 20,
              createdAt: new Date("2026-04-20T00:01:00.000Z"),
            }),
          },
          {
            ...makeComment(203, {
              parentCommentId: 20,
              createdAt: new Date("2026-04-20T00:02:00.000Z"),
            }),
          },
        ],
      },
    ]);
  });

  it("returns an empty reply list without issuing a reply query when no parents are found", async () => {
    prismaMock.comment.findMany.mockResolvedValueOnce([]);

    const result = await service.findCommentsByPost({
      postId: 1,
      first: 5,
      viewerId: 10,
    });

    expect(result.items).toEqual([]);
    expect(prismaMock.comment.findMany).toHaveBeenCalledTimes(1);
  });

  it("applies the cursor filter when paginating top-level comments", async () => {
    const after = encodeChronoCursor({
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      id: 999,
    });

    prismaMock.comment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.findCommentsByPost({
      postId: 1,
      first: 5,
      after,
      viewerId: 10,
    });

    expect(prismaMock.comment.findMany).toHaveBeenNthCalledWith(1, {
      take: 6,
      where: {
        AND: [
          {
            postId: 1,
            parentCommentId: null,
            removedAt: null,
          },
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
  });

  it("rejects invalid cursors before querying comments", async () => {
    await expect(
      service.findCommentsByPost({
        postId: 1,
        first: 5,
        after: "%%%invalid%%%",
        viewerId: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects suspended viewers", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.SUSPENDED,
    });

    await expect(
      service.findCommentsByPost({
        postId: 1,
        viewerId: 10,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("hides comments when the post is no longer readable", async () => {
    prismaMock.post.findUnique.mockResolvedValue({
      id: 1,
      authorId: 7,
      removedAt: null,
      author: {
        accountState: AccountState.ACTIVE,
        privacySetting: UserPrivacySetting.PRIVATE,
      },
    });
    prismaMock.follow.findUnique.mockResolvedValue(null);

    await expect(
      service.findCommentsByPost({
        postId: 1,
        viewerId: 99,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("hides comments when the viewer is blocked by the post author", async () => {
    prismaMock.userBlock.findFirst.mockResolvedValue({ id: 9 });

    await expect(
      service.findCommentsByPost({
        postId: 1,
        viewerId: 99,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.comment.findMany).not.toHaveBeenCalled();
  });

  it("filters out muted comment authors in list reads", async () => {
    mutesServiceMock.getMutedUserIdsForScope.mockResolvedValue([20]);
    prismaMock.comment.findMany.mockResolvedValueOnce([
      makeComment(30),
      makeComment(10),
    ]);
    prismaMock.comment.findMany.mockResolvedValueOnce([]);

    await service.findCommentsByPost({
      postId: 1,
      first: 2,
      viewerId: 99,
    });

    expect(prismaMock.comment.findMany).toHaveBeenNthCalledWith(1, {
      take: 3,
      where: {
        postId: 1,
        parentCommentId: null,
        removedAt: null,
        authorId: { notIn: [20] },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SafeCommentSelect,
    });
    expect(mutesServiceMock.getMutedUserIdsForScope).toHaveBeenCalledWith(
      99,
      MuteScope.COMMENTS,
    );
  });
});

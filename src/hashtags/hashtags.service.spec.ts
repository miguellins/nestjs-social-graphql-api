import { BadRequestException } from "@nestjs/common";

import { HashtagsService } from "@/hashtags/hashtags.service";

import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";

import type { Prisma } from "@prisma/client";

describe("HashtagsService", () => {
  let service: HashtagsService;

  const tx = {
    hashtag: {
      updateMany: jest.fn(),
      upsert: jest.fn(),
    },
    postHashtag: {
      createMany: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const transaction = tx as unknown as Prisma.TransactionClient;
  const prismaMock = {
    post: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const cacheHelperMock = {
    getOrSet: jest.fn(),
    getVersion: jest.fn(),
  };
  const postReadServiceMock = {
    buildViewerVisibilityFilters: jest.fn(),
    getBlockedAuthorIds: jest.fn(),
  };
  const mutesServiceMock = {
    getMutedUserIds: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HashtagsService(
      prismaMock as never,
      cacheHelperMock as never,
      postReadServiceMock as never,
      mutesServiceMock as never,
    );
    tx.hashtag.updateMany.mockResolvedValue({ count: 1 });
    tx.hashtag.upsert.mockImplementation(
      ({ where }: { where: { slug: string } }) =>
        Promise.resolve({ id: where.slug === "new" ? 3 : 2 }),
    );
    tx.postHashtag.createMany.mockResolvedValue({ count: 1 });
    tx.postHashtag.deleteMany.mockResolvedValue({ count: 1 });
    tx.postHashtag.findMany.mockResolvedValue([]);
    prismaMock.post.findMany.mockResolvedValue([]);
    (prismaMock as unknown as { hashtag: { findMany: jest.Mock } }).hashtag = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    cacheHelperMock.getVersion.mockResolvedValue(4);
    cacheHelperMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    postReadServiceMock.buildViewerVisibilityFilters.mockReturnValue([
      {
        author: {
          privacySetting: UserPrivacySetting.PUBLIC,
        },
      },
    ]);
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([]);
    mutesServiceMock.getMutedUserIds.mockResolvedValue([]);
  });

  it("replaces joins and applies public counter deltas in the same transaction", async () => {
    tx.postHashtag.findMany.mockResolvedValue([
      { hashtagId: 1, hashtag: { slug: "old" } },
      { hashtagId: 2, hashtag: { slug: "keep" } },
    ]);

    const result = await service.replacePostHashtags({
      tx: transaction,
      postId: 10,
      content: "#keep #new",
      postCreatedAt: new Date("2026-05-13T10:00:00.000Z"),
      publiclyCountable: true,
    });

    expect(tx.postHashtag.deleteMany).toHaveBeenCalledWith({
      where: {
        postId: 10,
        hashtagId: { in: [1] },
      },
    });
    expect(tx.hashtag.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
      data: { postsCount: { decrement: 1 } },
    });
    expect(tx.hashtag.upsert).toHaveBeenCalledWith({
      where: { slug: "new" },
      create: { slug: "new", postsCount: 0 },
      update: {},
      select: { id: true },
    });
    expect(tx.postHashtag.createMany).toHaveBeenCalledWith({
      data: [
        {
          postId: 10,
          hashtagId: 3,
          postCreatedAt: new Date("2026-05-13T10:00:00.000Z"),
        },
      ],
      skipDuplicates: true,
    });
    expect(tx.hashtag.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [3] } },
      data: { postsCount: { increment: 1 } },
    });
    expect(result).toEqual({ changed: true, publicCountChanged: true });
  });

  it("keeps joins for private posts without changing public counts", async () => {
    await service.replacePostHashtags({
      tx: transaction,
      postId: 10,
      content: "#private",
      postCreatedAt: new Date("2026-05-13T10:00:00.000Z"),
      publiclyCountable: false,
    });

    expect(tx.postHashtag.createMany).toHaveBeenCalled();
    expect(tx.hashtag.updateMany).not.toHaveBeenCalled();
  });

  it("strips joins and decrements public counts when a post is removed", async () => {
    tx.postHashtag.findMany.mockResolvedValue([
      { hashtagId: 1 },
      { hashtagId: 2 },
    ]);

    const result = await service.stripPostHashtags({
      tx: transaction,
      postId: 10,
      publiclyCountable: true,
    });

    expect(tx.postHashtag.deleteMany).toHaveBeenCalledWith({
      where: { postId: 10 },
    });
    expect(tx.hashtag.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1, 2] } },
      data: { postsCount: { decrement: 1 } },
    });
    expect(result).toEqual({ changed: true, publicCountChanged: true });
  });

  it("re-links hashtags during restore-style replacement", async () => {
    const result = await service.replacePostHashtags({
      tx: transaction,
      postId: 10,
      content: "#restored",
      postCreatedAt: new Date("2026-05-13T10:00:00.000Z"),
      publiclyCountable: true,
    });

    expect(tx.postHashtag.createMany).toHaveBeenCalled();
    expect(result).toEqual({ changed: true, publicCountChanged: true });
  });

  it("rejects reserved hashtag slugs during validation", () => {
    expect(() => service.validatePostContentHashtags("#support")).toThrow(
      BadRequestException,
    );
  });

  it("detects public count eligibility using anonymous timeline visibility", () => {
    expect(
      service.isPubliclyCountablePost({
        removedAt: null,
        author: {
          accountState: AccountState.ACTIVE,
          privacySetting: UserPrivacySetting.PUBLIC,
        },
      }),
    ).toBe(true);

    expect(
      service.isPubliclyCountablePost({
        removedAt: null,
        author: {
          accountState: AccountState.ACTIVE,
          privacySetting: UserPrivacySetting.PRIVATE,
        },
      }),
    ).toBe(false);
  });

  it("reads hashtag posts with anonymous timeline visibility and cache", async () => {
    await service.postsByHashtag({
      hashtag: "#GraphQL",
      first: 5,
      orderBy: ChronologicalOrder.NEWEST,
    });

    expect(cacheHelperMock.getVersion).toHaveBeenCalledWith("v:posts:list");
    expect(cacheHelperMock.getOrSet).toHaveBeenCalledWith(
      `hashtags:graphql:posts:v4:first=5:after=none:order=${ChronologicalOrder.NEWEST}`,
      expect.any(Function),
      30_000,
    );
    expect(prismaMock.post.findMany).toHaveBeenCalledWith({
      take: 6,
      where: {
        AND: [
          { removedAt: null },
          {
            hashtags: {
              some: {
                hashtag: { slug: "graphql" },
              },
            },
          },
          {
            author: {
              privacySetting: UserPrivacySetting.PUBLIC,
              accountState: { not: AccountState.DEACTIVATED },
            },
          },
          {
            author: {
              privacySetting: UserPrivacySetting.PUBLIC,
            },
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: SafePostListSelect,
    });
  });

  it("applies authenticated block and mute filters to hashtag posts", async () => {
    postReadServiceMock.buildViewerVisibilityFilters.mockReturnValue([
      {
        OR: [
          { authorId: 7 },
          { author: { privacySetting: UserPrivacySetting.PUBLIC } },
        ],
      },
    ]);
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([2]);
    mutesServiceMock.getMutedUserIds.mockResolvedValue([3]);

    await service.postsByHashtag({ hashtag: "news", first: 5 }, { id: 7 });

    expect(prismaMock.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { authorId: { notIn: [2] } },
            { authorId: { notIn: [3] } },
          ]) as unknown[],
        },
      }),
    );
  });

  it("searches hashtags by normalized prefix with versioned cache", async () => {
    const hashtagMock = (
      prismaMock as unknown as {
        hashtag: { findMany: jest.Mock };
      }
    ).hashtag;
    hashtagMock.findMany.mockResolvedValue([
      { slug: "graphql", postsCount: 10 },
    ]);

    const result = await service.searchHashtags({ q: " #G ", first: 5 });

    expect(cacheHelperMock.getVersion).toHaveBeenCalledWith("v:hashtags:list");
    expect(cacheHelperMock.getOrSet).toHaveBeenCalledWith(
      "hashtags:search:v4:q=g:first=5",
      expect.any(Function),
      30_000,
    );
    expect(hashtagMock.findMany).toHaveBeenCalledWith({
      take: 5,
      where: {
        slug: {
          startsWith: "g",
        },
      },
      orderBy: [{ postsCount: "desc" }, { slug: "asc" }],
      select: {
        slug: true,
        postsCount: true,
      },
    });
    expect(result).toEqual([{ slug: "graphql", postsCount: 10 }]);
  });
});

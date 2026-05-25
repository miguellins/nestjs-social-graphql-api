import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";

import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";
import { SearchPostsReadService } from "@/search/search-posts-read.service";
import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

describe("SearchPostsReadService", () => {
  const makePost = (id: number, authorId = id) => ({
    id,
    title: `Title ${id}`,
    content: `Content ${id}`,
    kind: "ORIGINAL",
    sourcePostId: null,
    createdAt: new Date(`2026-05-${String(id).padStart(2, "0")}T00:00:00.000Z`),
    likesCount: 0,
    commentsCount: 0,
    repostsCount: 0,
    author: {
      id: authorId,
      name: `User ${authorId}`,
      username: `user${authorId}`,
      privacySetting: UserPrivacySetting.PUBLIC,
      accountState: AccountState.ACTIVE,
    },
  });

  const prismaMock = {
    $queryRaw: jest.fn(),
    post: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };
  const cacheHelperMock = {
    getVersion: jest.fn(),
    getOrSet: jest.fn(),
  };
  const postReadServiceMock = {
    buildViewerVisibilityFilters: jest.fn(),
    buildListSurfaceSourceAvailabilityFilter: jest.fn(),
    getBlockedAuthorIds: jest.fn(),
    projectPostListRows: jest.fn(),
  };
  const mutesServiceMock = {
    getMutedUserIdsForScope: jest.fn(),
  };

  let service: SearchPostsReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$queryRaw.mockResolvedValue([{ id: 2 }, { id: 1 }]);
    prismaMock.post.findMany.mockResolvedValue([makePost(1), makePost(2)]);
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    cacheHelperMock.getVersion.mockResolvedValue(7);
    cacheHelperMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    postReadServiceMock.buildViewerVisibilityFilters.mockReturnValue([
      { author: { privacySetting: UserPrivacySetting.PUBLIC } },
    ]);
    postReadServiceMock.buildListSurfaceSourceAvailabilityFilter.mockReturnValue(
      {
        OR: [{ kind: "ORIGINAL" }],
      },
    );
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([]);
    postReadServiceMock.projectPostListRows.mockImplementation(
      (rows: unknown[]) => rows,
    );
    mutesServiceMock.getMutedUserIdsForScope.mockResolvedValue([]);

    service = new SearchPostsReadService(
      prismaMock as never,
      cacheHelperMock as never,
      postReadServiceMock as never,
      mutesServiceMock as never,
    );
  });

  it("uses a normalized cache key, raw relevance lookup, safe hydrate filters, and raw ordering", async () => {
    const result = await service.searchPosts({
      q: " +GraphQL -NestJS ",
      first: 5,
    });

    expect(cacheHelperMock.getVersion).toHaveBeenCalledWith("v:search:posts");
    expect(cacheHelperMock.getOrSet).toHaveBeenCalledWith(
      "search:posts:v7:q=graphql nestjs:viewer=anon:first=5",
      expect.any(Function),
      30_000,
    );
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.post.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { id: { in: [2, 1] } },
          { removedAt: null },
          { author: { accountState: { not: AccountState.DEACTIVATED } } },
          { author: { privacySetting: UserPrivacySetting.PUBLIC } },
          { OR: [{ kind: "ORIGINAL" }] },
        ],
      },
      select: SafePostListSelect,
    });
    expect(result.map((post) => post.id)).toEqual([2, 1]);
  });

  it("applies authenticated active-user, block, and POSTS mute filters", async () => {
    postReadServiceMock.buildViewerVisibilityFilters.mockReturnValue([
      { OR: [{ authorId: 7 }, { author: { privacySetting: "PUBLIC" } }] },
    ]);
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([3]);
    mutesServiceMock.getMutedUserIdsForScope.mockResolvedValue([4]);

    await service.searchPosts({ q: "graphql", first: 5 }, { id: 7 });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { accountState: true },
    });
    expect(mutesServiceMock.getMutedUserIdsForScope).toHaveBeenCalledWith(
      7,
      MuteScope.POSTS,
    );
    expect(prismaMock.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: expect.arrayContaining([
            { authorId: { notIn: [3] } },
            { authorId: { notIn: [4] } },
          ]) as unknown[],
        },
      }),
    );
  });

  it("returns fewer than first when hydrate filters remove raw matches", async () => {
    prismaMock.post.findMany.mockResolvedValue([makePost(1)]);

    const result = await service.searchPosts({ q: "graphql", first: 5 });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(1);
  });

  it("rejects invalid normalized input and suspended viewers", async () => {
    await expect(service.searchPosts({ q: "***", first: 5 })).rejects.toThrow(
      BadRequestException,
    );

    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.SUSPENDED,
    });

    await expect(
      service.searchPosts({ q: "graphql", first: 5 }, { id: 7 }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("maps raw and Prisma failures to sanitized errors", async () => {
    prismaMock.$queryRaw.mockRejectedValue(new Error("sql leaked"));

    await expect(
      service.searchPosts({ q: "graphql", first: 5 }),
    ).rejects.toThrow(InternalServerErrorException);
  });
});

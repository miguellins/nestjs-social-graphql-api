import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";

import { PostReadService } from "@/posts/post-read.service";
import { MutesService } from "@/mutes/mutes.service";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

import { PrismaService } from "@/prisma/prisma.service";

import { AccountState } from "@/users/enums/account-state.enum";

import { BookmarksService } from "./bookmarks.service";

describe("BookmarksService", () => {
  let service: BookmarksService;
  let moduleRef: TestingModule;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    post: {
      findFirst: jest.fn(),
    },
    bookmark: {
      create: jest.fn<Promise<unknown>, [Prisma.BookmarkCreateArgs]>(),
      deleteMany: jest.fn<Promise<unknown>, [Prisma.BookmarkDeleteManyArgs]>(),
      findMany: jest.fn<Promise<unknown>, [Prisma.BookmarkFindManyArgs]>(),
    },
  };

  const cacheMock = {
    getVersion: jest.fn(),
    bumpVersion: jest.fn(),
    getOrSet: jest.fn(),
  };

  const postReadServiceMock = {
    getBlockedAuthorIds: jest.fn(),
    buildViewerVisibilityFilters: jest.fn(),
  };

  const mutesServiceMock = {
    getMutedUserIdsForScope: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.ACTIVE,
    });
    postReadServiceMock.getBlockedAuthorIds.mockResolvedValue([]);
    mutesServiceMock.getMutedUserIdsForScope.mockResolvedValue([]);
    postReadServiceMock.buildViewerVisibilityFilters.mockReturnValue([
      {
        OR: [
          { authorId: 1 },
          {
            author: {
              privacySetting: "PUBLIC",
            },
          },
        ],
      },
    ]);
    cacheMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    cacheMock.getVersion.mockResolvedValue(2);

    moduleRef = await Test.createTestingModule({
      providers: [
        BookmarksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: PostReadService, useValue: postReadServiceMock },
        { provide: MutesService, useValue: mutesServiceMock },
      ],
    }).compile();

    service = moduleRef.get(BookmarksService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("creates a bookmark and bumps only the current user's bookmark list version", async () => {
    prismaMock.post.findFirst.mockResolvedValue({ id: 10 });
    prismaMock.bookmark.create.mockResolvedValue({
      id: 1,
      createdAt: new Date("2026-04-12T00:00:00.000Z"),
      post: {
        id: 10,
        title: null,
        content: "post",
        createdAt: new Date("2026-04-12T00:00:00.000Z"),
        likesCount: 0,
        commentsCount: 0,
        author: {
          id: 2,
          name: "Author",
          username: "author",
          privacySetting: "PUBLIC",
          accountState: AccountState.ACTIVE,
        },
      },
    });

    const result = await service.bookmarkPost(1, 10);

    expect(result.id).toBe(1);
    expect(prismaMock.bookmark.create).toHaveBeenCalledTimes(1);
    const createCall = prismaMock.bookmark.create.mock.calls[0];
    expect(createCall).toBeDefined();
    expect(createCall?.[0]?.data).toEqual({
      userId: 1,
      postId: 10,
    });
    expect(createCall?.[0]?.select).toMatchObject({
      id: true,
      createdAt: true,
    });
    expect(cacheMock.bumpVersion).toHaveBeenCalledWith(
      "v:user:1:bookmarks:list",
    );
  });

  it("throws ConflictException on duplicate bookmark and does not bump cache version", async () => {
    prismaMock.post.findFirst.mockResolvedValue({ id: 10 });
    prismaMock.bookmark.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(service.bookmarkPost(1, 10)).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(cacheMock.bumpVersion).not.toHaveBeenCalled();
  });

  it("throws NotFoundException when the target post is not visible", async () => {
    prismaMock.post.findFirst.mockResolvedValue(null);

    await expect(service.bookmarkPost(1, 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(prismaMock.bookmark.create).not.toHaveBeenCalled();
  });

  it("returns idempotent success when removing a bookmark that does not exist", async () => {
    prismaMock.bookmark.deleteMany.mockResolvedValue({ count: 0 });

    await expect(service.removeBookmark(1, 10)).resolves.toEqual({
      message: "Bookmark removed successfully",
    });

    expect(cacheMock.bumpVersion).not.toHaveBeenCalled();
  });

  it("bumps bookmark list version when a bookmark is removed", async () => {
    prismaMock.bookmark.deleteMany.mockResolvedValue({ count: 1 });

    await service.removeBookmark(1, 10);

    expect(cacheMock.bumpVersion).toHaveBeenCalledWith(
      "v:user:1:bookmarks:list",
    );
  });

  it("returns a cursor-paginated bookmark page and excludes hidden posts through the query filter", async () => {
    const after = encodeChronoCursor({
      createdAt: new Date("2026-04-10T00:00:00.000Z"),
      id: 5,
    });
    prismaMock.bookmark.findMany.mockResolvedValue([
      {
        id: 6,
        createdAt: new Date("2026-04-11T00:00:00.000Z"),
        post: {
          id: 10,
          title: null,
          content: "post",
          createdAt: new Date("2026-04-11T00:00:00.000Z"),
          likesCount: 1,
          commentsCount: 2,
          author: {
            id: 2,
            name: "Author",
            username: "author",
            privacySetting: "PUBLIC",
            accountState: AccountState.ACTIVE,
          },
        },
      },
    ]);

    const result = await service.findMyBookmarks(1, {
      first: 5,
      after,
      orderBy: ChronologicalOrder.NEWEST,
    });

    expect(cacheMock.getVersion).toHaveBeenCalledWith(
      "v:user:1:bookmarks:list",
    );
    expect(cacheMock.getOrSet).toHaveBeenCalledWith(
      `user:1:bookmarks:list:v2:first=5:after=${after}:order=${ChronologicalOrder.NEWEST}`,
      expect.any(Function),
      30_000,
    );
    expect(prismaMock.bookmark.findMany).toHaveBeenCalledTimes(1);
    const findManyCall = prismaMock.bookmark.findMany.mock.calls[0];
    expect(findManyCall).toBeDefined();
    expect(findManyCall?.[0]?.take).toBe(6);
    expect(findManyCall?.[0]?.where).toEqual({
      AND: [
        { userId: 1 },
        {
          OR: [
            { createdAt: { lt: new Date("2026-04-10T00:00:00.000Z") } },
            {
              createdAt: new Date("2026-04-10T00:00:00.000Z"),
              id: { lt: 5 },
            },
          ],
        },
        {
          post: {
            is: {
              AND: [
                { removedAt: null },
                {
                  author: {
                    accountState: {
                      not: AccountState.DEACTIVATED,
                    },
                  },
                },
                {
                  OR: [
                    { authorId: 1 },
                    {
                      author: {
                        privacySetting: "PUBLIC",
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    });
    expect(findManyCall?.[0]?.orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(findManyCall?.[0]?.select).toMatchObject({
      id: true,
      createdAt: true,
    });
    expect(result.items).toHaveLength(1);
    expect(mutesServiceMock.getMutedUserIdsForScope).toHaveBeenCalledWith(
      1,
      MuteScope.POSTS,
    );
  });

  it("rejects suspended users from bookmark operations", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      accountState: AccountState.SUSPENDED,
    });

    await expect(service.findMyBookmarks(1)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

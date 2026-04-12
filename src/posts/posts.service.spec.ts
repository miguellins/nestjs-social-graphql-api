import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { Prisma } from "@prisma/client";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import { CreatedPostSelect } from "@/posts/dto/created-post.dto";
import { SafePostDetailSelect } from "@/posts/dto/safe-post-detail.dto";

import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";

import { CreatePostInput } from "@/posts/dto/create-post.input";

import { UpdatePostInput } from "@/posts/dto/update-post.input";

import { R2StorageService } from "@/media/storage/r2-storage.service";
import { PostReadService } from "@/posts/post-read.service";
import { PrismaService } from "@/prisma/prisma.service";
import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

import { PostsService } from "./posts.service";

describe("PostsService", () => {
  let service: PostsService;
  let moduleRef: TestingModule;
  const maxContent = "a".repeat(2000);
  const tooLongContent = "a".repeat(2001);
  const makeListPost = (id: number) => ({
    id,
    title: `Title ${id}`,
    content: `Content ${id}`,
    createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
    likesCount: id,
    commentsCount: id + 1,
    author: {
      id,
      name: `User ${id}`,
      username: `user${id}`,
      privacySetting: UserPrivacySetting.PUBLIC,
      accountState: AccountState.ACTIVE,
    },
  });

  const prismaMock: {
    post: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    contentReport: {
      updateMany: jest.Mock;
    };
    moderationAction: {
      create: jest.Mock;
    };
    userBlock: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  } = {
    post: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
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
    userBlock: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const cacheMock: {
    get: jest.Mock;
    set: jest.Mock;
    getVersion: jest.Mock;
    bumpVersion: jest.Mock;
    del: jest.Mock;
    getOrSet: jest.Mock;
  } = {
    get: jest.fn(),
    set: jest.fn(),
    getVersion: jest.fn(),
    bumpVersion: jest.fn(),
    del: jest.fn(),
    getOrSet: jest.fn(),
  };

  // ✅ NEW: in-memory read-through cache to test cache hits
  const mem = new Map<string, unknown>();

  const r2StorageMock: {
    getPublicUrl: jest.Mock;
  } = {
    getPublicUrl: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mem.clear();
    prismaMock.user.findUnique.mockResolvedValue({
      id: 7,
      accountState: AccountState.ACTIVE,
      privacySetting: UserPrivacySetting.PUBLIC,
    });
    prismaMock.userBlock.findMany.mockResolvedValue([]);
    r2StorageMock.getPublicUrl.mockImplementation(
      (objectKey: string) => `https://media.example.com/${objectKey}`,
    );

    cacheMock.get.mockImplementation((key: string) =>
      Promise.resolve(mem.get(key)),
    );
    cacheMock.set.mockImplementation((key: string, value: unknown) => {
      mem.set(key, value);
      return Promise.resolve();
    });
    cacheMock.del.mockImplementation((key: string) => {
      mem.delete(key);
      return Promise.resolve();
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
        MediaReadProjectionService,
        PostReadService,
        PostsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: R2StorageService, useValue: r2StorageMock },
      ],
    }).compile();

    service = moduleRef.get(PostsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("findPosts", () => {
    it("caps first, normalizes search, uses cursor-aware cache keys, and queries prisma correctly", async () => {
      cacheMock.getVersion.mockResolvedValue(5);
      const rows = [makeListPost(3), makeListPost(2), makeListPost(1)];
      prismaMock.post.findMany.mockResolvedValue(rows);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      const params = {
        first: PAGINATION.MAX_TAKE + 999,
        after,
        q: "  HeLLo  ",
      };
      const res = await service.findPosts(params);

      const expectedFirst = PAGINATION.MAX_TAKE;
      const expectedSearch = "hello";
      const decodedAfter = new Date("2026-04-10T00:00:00.000Z");

      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `posts:list:v5:first=${expectedFirst}:after=${after}:q=${expectedSearch}:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: expectedFirst + 1,
        where: {
          AND: [
            { removedAt: null },
            {
              author: {
                privacySetting: UserPrivacySetting.PUBLIC,
                accountState: { not: AccountState.DEACTIVATED },
              },
            },
            {
              OR: [
                { title: { contains: expectedSearch } },
                { content: { contains: expectedSearch } },
              ],
            },
            {
              OR: [
                { createdAt: { lt: decodedAfter } },
                { createdAt: decodedAfter, id: { lt: 999 } },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafePostListSelect,
      });

      expect(res.items).toEqual(rows);
      expect(res.pageInfo.hasNextPage).toBe(false);
      expect(res.pageInfo.endCursor).toBeDefined();
    });

    it("uses defaults and returns a cursor page when no search is provided", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.post.findMany.mockResolvedValue([]);

      await service.findPosts(undefined);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `posts:list:v1:first=${PAGINATION.DEFAULT_TAKE}:after=none:q=all:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: {
          AND: [
            { removedAt: null },
            {
              author: {
                privacySetting: UserPrivacySetting.PUBLIC,
                accountState: { not: AccountState.DEACTIVATED },
              },
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafePostListSelect,
      });
    });

    it("returns cached page value on cache hit without calling prisma", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      const rows = [makeListPost(1)];

      prismaMock.post.findMany.mockResolvedValue(rows);

      const params = { first: 1, q: "hi" };
      await service.findPosts(params);

      prismaMock.post.findMany.mockClear();

      const res = await service.findPosts(params);

      expect(prismaMock.post.findMany).not.toHaveBeenCalled();
      expect(res.items).toEqual(rows);
    });

    it("throws BadRequestException for an invalid cursor", async () => {
      await expect(
        service.findPosts({ first: 5, after: "%%%invalid%%%" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(cacheMock.getVersion).not.toHaveBeenCalled();
      expect(prismaMock.post.findMany).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST cursor pagination", async () => {
      cacheMock.getVersion.mockResolvedValue(6);
      prismaMock.post.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.findPosts({
        first: 5,
        after,
        orderBy: ChronologicalOrder.OLDEST,
      });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: 6,
        where: {
          AND: [
            {
              removedAt: null,
            },
            {
              author: {
                privacySetting: UserPrivacySetting.PUBLIC,
                accountState: { not: AccountState.DEACTIVATED },
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
        select: SafePostListSelect,
      });
    });

    it("hides moderated posts from the public posts list", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      const visibleRows = [makeListPost(2), makeListPost(1)];
      prismaMock.post.findMany.mockResolvedValue(visibleRows);

      const result = await service.findPosts({ first: 5 });

      expect(result.items).toEqual(visibleRows);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toEqual(expect.any(String));

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: 6,
        where: {
          AND: [
            { removedAt: null },
            {
              author: {
                privacySetting: UserPrivacySetting.PUBLIC,
                accountState: { not: AccountState.DEACTIVATED },
              },
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafePostListSelect,
      });
    });
  });

  describe("findPostsByUsername", () => {
    it("normalizes username, caches timeline by author id, and returns a page of posts", async () => {
      cacheMock.getVersion.mockResolvedValue(4);
      prismaMock.user.findUnique.mockResolvedValue({
        id: 7,
        privacySetting: UserPrivacySetting.PUBLIC,
        accountState: AccountState.ACTIVE,
      });
      const rows = [makeListPost(3), makeListPost(2), makeListPost(1)];
      prismaMock.post.findMany.mockResolvedValue(rows);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      const res = await service.findPostsByUsername("  TeSter  ", {
        first: PAGINATION.MAX_TAKE + 99,
        after,
      });

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { username: "tester" },
        select: {
          id: true,
          privacySetting: true,
          accountState: true,
        },
      });
      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:user:7:posts:list");
      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `user:7:posts:list:v4:first=${PAGINATION.MAX_TAKE}:after=${after}:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );
      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: PAGINATION.MAX_TAKE + 1,
        where: {
          AND: [
            { authorId: 7 },
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
        select: SafePostListSelect,
      });
      expect(res.items).toEqual(rows);
      expect(res.pageInfo.hasNextPage).toBe(false);
    });

    it("throws NotFoundException when author username does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(
        service.findPostsByUsername("missing"),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prismaMock.post.findMany).not.toHaveBeenCalled();
    });

    it("returns an empty list when the author exists but has no posts", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 7,
        privacySetting: UserPrivacySetting.PUBLIC,
        accountState: AccountState.ACTIVE,
      });
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.post.findMany.mockResolvedValue([]);

      await expect(service.findPostsByUsername("tester")).resolves.toEqual({
        items: [],
        pageInfo: {
          endCursor: null,
          hasNextPage: false,
        },
      });
    });

    it("throws BadRequestException when username timeline cursor is invalid", async () => {
      await expect(
        service.findPostsByUsername("tester", {
          first: 5,
          after: "%%%invalid%%%",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.findMany).not.toHaveBeenCalled();
    });

    it("hides moderated posts from postsByUsername", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 7,
        privacySetting: UserPrivacySetting.PUBLIC,
        accountState: AccountState.ACTIVE,
      });
      cacheMock.getVersion.mockResolvedValue(1);
      const visibleRows = [makeListPost(2), makeListPost(1)];
      prismaMock.post.findMany.mockResolvedValue(visibleRows);

      const result = await service.findPostsByUsername("tester");

      expect(result.items).toEqual(visibleRows);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toEqual(expect.any(String));

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE + 1,
        where: {
          authorId: 7,
          removedAt: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: SafePostListSelect,
      });
    });
  });

  describe("myFeed", () => {
    it("returns a cursor page for the current user's feed with deterministic ordering", async () => {
      const rows = [makeListPost(3), makeListPost(2), makeListPost(1)];
      prismaMock.userBlock.findMany.mockResolvedValue([]);
      prismaMock.post.findMany.mockResolvedValue(rows);

      const result = await service.myFeed(7, { first: 5 });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { removedAt: null },
            {
              author: {
                accountState: AccountState.ACTIVE,
              },
            },
            {
              OR: [
                {
                  authorId: 7,
                },
                {
                  author: {
                    privacySetting: UserPrivacySetting.PRIVATE,
                    followers: {
                      some: {
                        followerId: 7,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: SafePostListSelect,
      });

      expect(result.items).toEqual(rows);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toBeDefined();
    });

    it("applies the feed cursor filter", async () => {
      prismaMock.userBlock.findMany.mockResolvedValue([]);
      prismaMock.post.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.myFeed(7, { first: 5, after });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { removedAt: null },
            {
              author: {
                accountState: AccountState.ACTIVE,
              },
            },
            {
              OR: [
                {
                  authorId: 7,
                },
                {
                  author: {
                    privacySetting: UserPrivacySetting.PRIVATE,
                    followers: {
                      some: {
                        followerId: 7,
                      },
                    },
                  },
                },
              ],
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
        take: 6,
        select: SafePostListSelect,
      });
    });

    it("throws BadRequestException for an invalid feed cursor", async () => {
      await expect(
        service.myFeed(7, { first: 5, after: "%%%invalid%%%" }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.userBlock.findMany).not.toHaveBeenCalled();
      expect(prismaMock.post.findMany).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST feed pagination", async () => {
      prismaMock.userBlock.findMany.mockResolvedValue([]);
      prismaMock.post.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.myFeed(7, {
        first: 5,
        after,
        orderBy: ChronologicalOrder.OLDEST,
      });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { removedAt: null },
            {
              author: {
                accountState: AccountState.ACTIVE,
              },
            },
            {
              OR: [
                {
                  authorId: 7,
                },
                {
                  author: {
                    privacySetting: UserPrivacySetting.PRIVATE,
                    followers: {
                      some: {
                        followerId: 7,
                      },
                    },
                  },
                },
              ],
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
        take: 6,
        select: SafePostListSelect,
      });
    });

    it("filters blocked users out of the feed", async () => {
      prismaMock.userBlock.findMany.mockResolvedValue([
        { blockerId: 7, blockedId: 9 },
        { blockerId: 12, blockedId: 7 },
      ]);
      prismaMock.post.findMany.mockResolvedValue([]);

      await service.myFeed(7, { first: 5 });

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              removedAt: null,
            },
            {
              author: {
                accountState: AccountState.ACTIVE,
              },
            },
            {
              OR: [
                {
                  authorId: 7,
                },
                {
                  author: {
                    privacySetting: UserPrivacySetting.PRIVATE,
                    followers: {
                      some: {
                        followerId: 7,
                      },
                    },
                  },
                },
              ],
            },
            {
              authorId: { notIn: [9, 12] },
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: SafePostListSelect,
      });
    });

    it("hides moderated posts from myFeed", async () => {
      const visibleRows = [makeListPost(2), makeListPost(1)];
      prismaMock.userBlock.findMany.mockResolvedValue([]);
      prismaMock.post.findMany.mockResolvedValue(visibleRows);

      const result = await service.myFeed(7, { first: 5 });

      expect(result.items).toEqual(visibleRows);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toEqual(expect.any(String));

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { removedAt: null },
            {
              author: {
                accountState: AccountState.ACTIVE,
              },
            },
            {
              OR: [
                {
                  authorId: 7,
                },
                {
                  author: {
                    privacySetting: UserPrivacySetting.PRIVATE,
                    followers: {
                      some: {
                        followerId: 7,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: SafePostListSelect,
      });
    });
  });

  describe("getPost", () => {
    it("returns post detail immediately and updates viewsCount asynchronously", async () => {
      let resolveUpdate!: (value: { viewsCount: number }) => void;

      prismaMock.post.update.mockReturnValue(
        new Promise((resolve: (value: { viewsCount: number }) => void) => {
          resolveUpdate = resolve;
        }),
      );

      prismaMock.post.findFirst.mockResolvedValue({
        id: 10,
        viewsCount: 1,
        editedAt: null,
      });

      const res = await service.getPost(10);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        "posts:detail:10",
        expect.any(Function),
        60_000,
      );

      expect(prismaMock.post.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              id: 10,
              removedAt: null,
              author: {
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
        select: {
          ...SafePostDetailSelect,
          likes: {
            take: 20,
            orderBy: { createdAt: "desc" },
            select: SafePostDetailSelect.likes.select,
          },
          comments: {
            take: 20,
            where: { removedAt: null },
            orderBy: { createdAt: "desc" },
            select: SafePostDetailSelect.comments.select,
          },
        },
      });

      expect(res).toEqual({ id: 10, viewsCount: 1, editedAt: null });

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: {
          viewsCount: {
            increment: 1,
          },
        },
        select: {
          viewsCount: true,
        },
      });

      resolveUpdate({ viewsCount: 42 });
    });

    it("patches the cached viewsCount after the asynchronous increment succeeds", async () => {
      const cachedPost = { id: 10, viewsCount: 1, editedAt: null };

      prismaMock.post.findFirst.mockResolvedValue(cachedPost);
      prismaMock.post.update.mockResolvedValue({ viewsCount: 42 });

      const res = await service.getPost(10);

      expect(res).toEqual(cachedPost);

      await new Promise(setImmediate);

      expect(cacheMock.set).toHaveBeenCalledWith(
        "posts:detail:10",
        { id: 10, viewsCount: 42, editedAt: null },
        60_000,
      );
    });

    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      await expect(service.getPost(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.post.update).not.toHaveBeenCalled();
    });

    it("keeps the read response successful when the async viewsCount increment fails", async () => {
      prismaMock.post.findFirst.mockResolvedValue({
        id: 10,
        viewsCount: 1,
        editedAt: null,
      });
      prismaMock.post.update.mockRejectedValue(new Error("db offline"));

      await expect(service.getPost(10)).resolves.toEqual({
        id: 10,
        viewsCount: 1,
        editedAt: null,
      });

      await new Promise(setImmediate);

      expect(cacheMock.set).not.toHaveBeenCalled();
    });

    it("hides moderated posts from normal detail reads", async () => {
      prismaMock.post.findFirst.mockResolvedValue(null);

      await expect(service.getPost(10)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("createPost", () => {
    it("throws BadRequestException when provided title/content are empty after trim", async () => {
      await expect(
        service.createPost({ title: "   ", content: "ok" }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createPost({ title: "okay", content: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.create).not.toHaveBeenCalled();
    });

    it("creates post with trimmed inputs, bumps/invalidates caches and returns post", async () => {
      const created = {
        id: 1,
        title: "Test",
        content: "Content",
        createdAt: new Date("2026-04-06T00:00:00.000Z"),
        author: {
          id: 7,
          name: "User 7",
          username: "user7",
        },
      };
      prismaMock.post.create.mockResolvedValue(created);

      const input: CreatePostInput = {
        title: "  Test  ",
        content: "  Content  ",
      };
      const res = await service.createPost(input, 7);

      expect(prismaMock.post.create).toHaveBeenCalledWith({
        data: {
          title: "Test",
          content: "Content",
          author: { connect: { id: 7 } },
        },
        select: CreatedPostSelect,
      });

      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:7");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual(created);
    });

    it("creates a body-first post without title", async () => {
      const created = {
        id: 1,
        title: null,
        content: "Content",
        createdAt: new Date("2026-04-06T00:00:00.000Z"),
        author: {
          id: 7,
          name: "User 7",
          username: "user7",
        },
      };
      prismaMock.post.create.mockResolvedValue(created);

      await expect(
        service.createPost({ content: "  Content  " }, 7),
      ).resolves.toEqual(created);

      expect(prismaMock.post.create).toHaveBeenCalledWith({
        data: {
          content: "Content",
          author: { connect: { id: 7 } },
        },
        select: CreatedPostSelect,
      });
    });

    it("creates post when content length is exactly 2000 characters", async () => {
      const created = {
        id: 1,
        title: "Test",
        content: maxContent,
        createdAt: new Date("2026-04-06T00:00:00.000Z"),
        author: {
          id: 1,
          name: "User 1",
          username: "user1",
        },
      };
      prismaMock.post.create.mockResolvedValue(created);

      await expect(
        service.createPost({ title: "Test", content: maxContent }, 1),
      ).resolves.toEqual(created);

      expect(prismaMock.post.create).toHaveBeenCalledWith({
        data: {
          title: "Test",
          content: maxContent,
          author: { connect: { id: 1 } },
        },
        select: CreatedPostSelect,
      });
    });

    it("creates posts without an edited marker", async () => {
      const created = {
        id: 1,
        title: "Test",
        content: "Content",
        createdAt: new Date("2026-04-06T00:00:00.000Z"),
        author: {
          id: 1,
          name: "User 1",
          username: "user1",
        },
      };
      prismaMock.post.create.mockResolvedValue(created);

      await expect(
        service.createPost({ title: "Test", content: "Content" }, 1),
      ).resolves.toEqual(created);
    });

    it("throws BadRequestException when content exceeds 2000 characters on create", async () => {
      await expect(
        service.createPost({ title: "Test", content: tooLongContent }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.create).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when Prisma errors P2003/P2025 (author not found)", async () => {
      const err1 = new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      });
      prismaMock.post.create.mockRejectedValue(err1);

      await expect(
        service.createPost({ title: "Test", content: "Content" }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);

      const err2 = new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.post.create.mockRejectedValue(err2);

      await expect(
        service.createPost({ title: "Test", content: "Content" }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets unexpected create errors bubble for the global filter to normalize", async () => {
      prismaMock.post.create.mockRejectedValue(new Error("boom"));

      await expect(
        service.createPost({ title: "Test", content: "Content" }, 1),
      ).rejects.toThrow("Failed to create post");
    });
  });

  describe("updatePost", () => {
    it("throws BadRequestException when no fields provided", async () => {
      const input: UpdatePostInput = {};
      await expect(service.updatePost(1, input, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("throws BadRequestException when provided title/content are empty after trim", async () => {
      await expect(
        service.updatePost(1, { title: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.updatePost(1, { content: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePost(1, { title: "okay" }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ForbiddenException when current user is not the author", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 999 });

      await expect(
        service.updatePost(1, { title: "okay" }, 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("updates post, invalidates detail cache, bumps list version, and returns post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 1,
        authorId: 7,
        title: "Old",
        content: "OldC",
      });

      const editedAt = new Date("2026-03-24T15:00:00.000Z");
      jest.useFakeTimers().setSystemTime(editedAt);

      const updated = { id: 1, title: "New", content: "NewC", editedAt };
      prismaMock.post.update.mockResolvedValue(updated);

      const input: UpdatePostInput = {
        title: "  New  ",
        content: "  NewC  ",
      };
      const res = await service.updatePost(1, input, 7);

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: "New", content: "NewC", editedAt },
        select: SafePostListSelect,
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:1");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");

      expect(res).toEqual(updated);
      jest.useRealTimers();
    });

    it("updates a post without changing title when only content is provided", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 1,
        authorId: 7,
        title: null,
        content: "Body",
      });

      const editedAt = new Date("2026-03-24T16:00:00.000Z");
      jest.useFakeTimers().setSystemTime(editedAt);

      const updated = { id: 1, title: null, content: "Updated body", editedAt };
      prismaMock.post.update.mockResolvedValue(updated);

      await expect(
        service.updatePost(1, { content: "  Updated body  " }, 7),
      ).resolves.toEqual(updated);

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { content: "Updated body", editedAt },
        select: SafePostListSelect,
      });
      jest.useRealTimers();
    });

    it("clears the title when update input sets it to null", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 1,
        authorId: 7,
        title: "Headline",
        content: "Body",
      });

      const editedAt = new Date("2026-03-24T17:00:00.000Z");
      jest.useFakeTimers().setSystemTime(editedAt);

      const updated = { id: 1, title: null, content: "Body", editedAt };
      prismaMock.post.update.mockResolvedValue(updated);

      await expect(service.updatePost(1, { title: null }, 7)).resolves.toEqual(
        updated,
      );

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: null, editedAt },
        select: SafePostListSelect,
      });
      jest.useRealTimers();
    });

    it("does not set editedAt when normalized post input does not change title or content", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 1,
        authorId: 7,
        title: "Headline",
        content: "Body",
      });

      const updated = {
        id: 1,
        title: "Headline",
        content: "Body",
        editedAt: null,
      };
      prismaMock.post.update.mockResolvedValue(updated);

      await expect(
        service.updatePost(
          1,
          { title: "  Headline  ", content: "  Body  " },
          7,
        ),
      ).resolves.toEqual(updated);

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: "Headline", content: "Body" },
        select: SafePostListSelect,
      });
    });

    it("updates post when content length is exactly 2000 characters", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 1,
        authorId: 7,
        title: "Test",
        content: "Old",
      });

      const editedAt = new Date("2026-03-24T18:00:00.000Z");
      jest.useFakeTimers().setSystemTime(editedAt);

      const updated = { id: 1, title: "Test", content: maxContent, editedAt };
      prismaMock.post.update.mockResolvedValue(updated);

      await expect(
        service.updatePost(1, { content: maxContent }, 7),
      ).resolves.toEqual(updated);

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { content: maxContent, editedAt },
        select: SafePostListSelect,
      });
      jest.useRealTimers();
    });

    it("throws BadRequestException when content exceeds 2000 characters on update", async () => {
      await expect(
        service.updatePost(1, { content: tooLongContent }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.post.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when Prisma update throws P2025", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 7 });

      const err = new Prisma.PrismaClientKnownRequestError("gone", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.post.update.mockRejectedValue(err);

      await expect(
        service.updatePost(1, { title: "okay" }, 7),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("lets unexpected update errors bubble for the global filter to normalize", async () => {
      prismaMock.post.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.updatePost(1, { title: "okay" }, 1)).rejects.toThrow(
        "Failed to update post",
      );
    });
  });

  describe("deletePost", () => {
    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(service.deletePost(1, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws ForbiddenException when current user is not the author", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 999 });

      await expect(service.deletePost(1, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it("deletes post, invalidates caches, bumps versions, and returns message", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 7 });
      prismaMock.post.delete.mockResolvedValue({ id: 1 });

      const res = await service.deletePost(1, 7);

      expect(prismaMock.post.delete).toHaveBeenCalledWith({ where: { id: 1 } });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:1");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");

      expect(res).toEqual({ message: "Post deleted successfully" });
    });

    it("throws NotFoundException when Prisma delete throws P2025 (race condition)", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 7 });

      const err = new Prisma.PrismaClientKnownRequestError("gone", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.post.delete.mockRejectedValue(err);

      await expect(service.deletePost(1, 7)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("lets unexpected delete errors bubble for the global filter to normalize", async () => {
      prismaMock.post.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.deletePost(1, 1)).rejects.toThrow(
        "Failed to delete post",
      );
    });
  });

  describe("removePostByModerator", () => {
    it("removes a post, logs the moderation action, and invalidates caches", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 10,
        authorId: 7,
        removedAt: null,
      });

      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            post: { updateMany: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            post: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            contentReport: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            moderationAction: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
            },
          };

          await cb(tx);

          expect(tx.post.updateMany).toHaveBeenCalledWith({
            where: { id: 10, removedAt: null },
            data: {
              removedAt: expect.any(Date) as Date,
              removedById: 3,
              removalReason: "spam",
            },
          });
          expect(tx.contentReport.updateMany).toHaveBeenCalledWith({
            where: {
              id: 99,
              postId: 10,
              status: "OPEN",
            },
            data: {
              status: "ACTIONED",
            },
          });
          expect(tx.moderationAction.create).toHaveBeenCalledWith({
            data: {
              actorId: 3,
              actionType: "REMOVE_POST",
              targetType: "POST",
              targetId: 10,
              reason: "spam",
              reportId: 99,
              postId: 10,
            },
          });
        },
      );

      await expect(
        service.removePostByModerator(
          { postId: 10, reason: "  spam  ", reportId: 99 },
          { id: 3, role: "MODERATOR" },
        ),
      ).resolves.toEqual({
        message: "Post removed successfully",
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:10");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
    });

    it("rejects normal users", async () => {
      await expect(
        service.removePostByModerator(
          { postId: 10, reason: "spam" },
          { id: 3, role: "USER" },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("throws NotFoundException when target post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(
        service.removePostByModerator(
          { postId: 10, reason: "spam" },
          { id: 3, role: "ADMIN" },
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws BadRequestException when post is already removed", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 10,
        authorId: 7,
        removedAt: new Date("2026-04-09T12:00:00.000Z"),
      });

      await expect(
        service.removePostByModerator(
          { postId: 10, reason: "spam" },
          { id: 3, role: "ADMIN" },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("allows admins to remove a post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 10,
        authorId: 7,
        removedAt: null,
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            post: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            post: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            moderationAction: {
              create: jest.fn().mockResolvedValue({ id: 1 }),
            },
          };

          await cb(tx as never);
        },
      );

      await expect(
        service.removePostByModerator(
          { postId: 10, reason: "policy violation" },
          { id: 9, role: "ADMIN" },
        ),
      ).resolves.toEqual({
        message: "Post removed successfully",
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:10");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:7:posts:list");
    });

    it("does not require a report id", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 10,
        authorId: 7,
        removedAt: null,
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            post: { updateMany: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            post: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
          expect(tx.moderationAction.create).toHaveBeenCalledWith({
            data: {
              actorId: 3,
              actionType: "REMOVE_POST",
              targetType: "POST",
              targetId: 10,
              reason: "spam",
              reportId: undefined,
              postId: 10,
            },
          });
        },
      );

      await expect(
        service.removePostByModerator(
          { postId: 10, reason: "spam" },
          { id: 3, role: "MODERATOR" },
        ),
      ).resolves.toEqual({
        message: "Post removed successfully",
      });
    });

    it("rejects a linked report that is not open for the post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 10,
        authorId: 7,
        removedAt: null,
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            post: { updateMany: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            post: {
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
        service.removePostByModerator(
          { postId: 10, reason: "spam", reportId: 99 },
          { id: 3, role: "MODERATOR" },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a concurrent second moderation removal without writing an action log", async () => {
      prismaMock.post.findUnique.mockResolvedValue({
        id: 10,
        authorId: 7,
        removedAt: null,
      });
      prismaMock.$transaction.mockImplementation(
        async (
          cb: (tx: {
            post: { updateMany: jest.Mock };
            contentReport: { updateMany: jest.Mock };
            moderationAction: { create: jest.Mock };
          }) => Promise<void>,
        ) => {
          const tx = {
            post: {
              updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            },
            contentReport: {
              updateMany: jest.fn(),
            },
            moderationAction: {
              create: jest.fn(),
            },
          };

          await cb(tx);
          expect(tx.moderationAction.create).not.toHaveBeenCalled();
        },
      );

      await expect(
        service.removePostByModerator(
          { postId: 10, reason: "spam" },
          { id: 3, role: "MODERATOR" },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

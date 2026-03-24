import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { Prisma } from "@prisma/client";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PAGINATION } from "@/common/constants/hard-cap.constants";

import { SafePostDetailSelect } from "@/posts/dto/safe-post-detail.dto";

import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";

import { CreatePostInput } from "@/posts/dto/create-post.input";

import { UpdatePostInput } from "@/posts/dto/update-post.input";

import { PrismaService } from "@/prisma.service";

import { PostsService } from "./posts.service";

describe("PostsService", () => {
  let service: PostsService;
  let moduleRef: TestingModule;
  const maxContent = "a".repeat(2000);
  const tooLongContent = "a".repeat(2001);

  const prismaMock: {
    post: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  } = {
    post: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
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

  beforeEach(async () => {
    jest.clearAllMocks();
    mem.clear();

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
        PostsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
      ],
    }).compile();

    service = moduleRef.get(PostsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("findPosts", () => {
    it("caps take, normalizes search, uses cache key with version + take + search, and queries prisma correctly", async () => {
      cacheMock.getVersion.mockResolvedValue(5);
      prismaMock.post.findMany.mockResolvedValue([{ id: 1 }]);

      const params = {
        take: PAGINATION.MAX_TAKE + 999,
        q: "  HeLLo  ",
      };
      const res = await service.findPosts(params);

      const expectedTake = PAGINATION.MAX_TAKE;
      const expectedSearch = "hello";

      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `posts:list:v5:${expectedTake}:${expectedSearch}:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: expectedTake,
        where: {
          OR: [
            { title: { contains: expectedSearch } },
            { content: { contains: expectedSearch } },
          ],
        },
        orderBy: { createdAt: "desc" },
        select: SafePostListSelect,
      });

      expect(res).toEqual([{ id: 1 }]);
    });

    it("uses defaults and omits where when no search", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.post.findMany.mockResolvedValue([]);

      await service.findPosts(undefined);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `posts:list:v1:${PAGINATION.DEFAULT_TAKE}:all:order=${ChronologicalOrder.NEWEST}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.post.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        where: undefined,
        orderBy: { createdAt: "desc" },
        select: SafePostListSelect,
      });
    });

    // ✅ NEW: cache hit behavior (factory not called)
    it("returns cached value on cache hit (does not call prisma)", async () => {
      cacheMock.getVersion.mockResolvedValue(1);

      prismaMock.post.findMany.mockResolvedValue([{ id: 123 }]);

      // prime cache
      const params = { take: 1, q: "hi" };
      await service.findPosts(params);

      prismaMock.post.findMany.mockClear();

      const res = await service.findPosts(params);

      expect(prismaMock.post.findMany).not.toHaveBeenCalled();
      expect(res).toEqual([{ id: 123 }]);
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

      prismaMock.post.findUnique.mockResolvedValue({ id: 10, viewsCount: 1 });

      const res = await service.getPost(10);

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        "posts:detail:10",
        expect.any(Function),
        60_000,
      );

      expect(prismaMock.post.findUnique).toHaveBeenCalledWith({
        where: { id: 10 },
        select: {
          ...SafePostDetailSelect,
          likes: {
            take: 20,
            orderBy: { createdAt: "desc" },
            select: SafePostDetailSelect.likes.select,
          },
          comments: {
            take: 20,
            orderBy: { createdAt: "desc" },
            select: SafePostDetailSelect.comments.select,
          },
        },
      });

      expect(res).toEqual({ id: 10, viewsCount: 1 });

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
      const cachedPost = { id: 10, viewsCount: 1 };

      prismaMock.post.findUnique.mockResolvedValue(cachedPost);
      prismaMock.post.update.mockResolvedValue({ viewsCount: 42 });

      const res = await service.getPost(10);

      expect(res).toEqual(cachedPost);

      await new Promise(setImmediate);

      expect(cacheMock.set).toHaveBeenCalledWith(
        "posts:detail:10",
        { id: 10, viewsCount: 42 },
        60_000,
      );
    });

    it("throws NotFoundException when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(service.getPost(999)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.post.update).not.toHaveBeenCalled();
    });

    it("keeps the read response successful when the async viewsCount increment fails", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 10, viewsCount: 1 });
      prismaMock.post.update.mockRejectedValue(new Error("db offline"));

      await expect(service.getPost(10)).resolves.toEqual({
        id: 10,
        viewsCount: 1,
      });

      await new Promise(setImmediate);

      expect(cacheMock.set).not.toHaveBeenCalled();
    });
  });

  describe("createPost", () => {
    it("throws BadRequestException when title/content are empty after trim", async () => {
      await expect(
        service.createPost({ title: "   ", content: "ok" }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.createPost({ title: "okay", content: "   " }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.create).not.toHaveBeenCalled();
    });

    it("creates post with trimmed inputs, bumps/invalidates caches and returns post", async () => {
      const created = { id: 1, title: "Test", content: "Content" };
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
        select: SafePostListSelect,
      });

      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:7");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual(created);
    });

    it("creates post when content length is exactly 2000 characters", async () => {
      const created = { id: 1, title: "Test", content: maxContent };
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
        select: SafePostListSelect,
      });
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

    it("throws InternalServerErrorException for unknown errors", async () => {
      prismaMock.post.create.mockRejectedValue(new Error("boom"));

      await expect(
        service.createPost({ title: "Test", content: "Content" }, 1),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
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
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 7 });

      const updated = { id: 1, title: "New", content: "NewC" };
      prismaMock.post.update.mockResolvedValue(updated);

      const input: UpdatePostInput = {
        title: "  New  ",
        content: "  NewC  ",
      };
      const res = await service.updatePost(1, input, 7);

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { title: "New", content: "NewC" },
        select: SafePostListSelect,
      });

      expect(cacheMock.del).toHaveBeenCalledWith("posts:detail:1");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:posts:list");

      expect(res).toEqual(updated);
    });

    it("updates post when content length is exactly 2000 characters", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 1, authorId: 7 });

      const updated = { id: 1, title: "Test", content: maxContent };
      prismaMock.post.update.mockResolvedValue(updated);

      await expect(
        service.updatePost(1, { content: maxContent }, 7),
      ).resolves.toEqual(updated);

      expect(prismaMock.post.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { content: maxContent },
        select: SafePostListSelect,
      });
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

    it("throws InternalServerErrorException for unexpected errors", async () => {
      prismaMock.post.findUnique.mockRejectedValue(new Error("boom"));

      await expect(
        service.updatePost(1, { title: "okay" }, 1),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
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

    it("throws InternalServerErrorException for unexpected errors", async () => {
      prismaMock.post.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.deletePost(1, 1)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});

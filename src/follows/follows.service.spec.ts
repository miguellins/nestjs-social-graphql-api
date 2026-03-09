import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { FollowsService } from "./follows.service";
import { PrismaService } from "@/prisma.service";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { NotificationsService } from "@/notifications/notifications.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { SafeFollowSelect } from "@/follows/dto/safe-follow.dto";

describe("FollowsService", () => {
  let service: FollowsService;

  const prismaMock: {
    follow: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  } = {
    follow: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const cacheMock: {
    getVersion: jest.Mock;
    bumpVersion: jest.Mock;
    del: jest.Mock;
    getOrSet: jest.Mock;
  } = {
    getVersion: jest.fn(),
    bumpVersion: jest.fn(),
    del: jest.fn(),
    getOrSet: jest.fn(),
  };

  const notificationsMock: {
    createAndPublishNotification: jest.Mock;
  } = {
    createAndPublishNotification: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    // Default: behave like a real cache wrapper: call the factory and return its result
    cacheMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        FollowsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: NotificationsService, useValue: notificationsMock },
      ],
    }).compile();

    service = moduleRef.get(FollowsService);
  });

  describe("findFollows", () => {
    it("uses cache key with version + take (capped) and queries prisma with SafeFollowSelect", async () => {
      cacheMock.getVersion.mockResolvedValue(3);

      prismaMock.follow.findMany.mockResolvedValue([
        { id: 10, followerId: 1, followingId: 2 },
      ]);

      const res = await service.findFollows({
        take: PAGINATION.MAX_TAKE + 999,
      });

      const expectedTake = PAGINATION.MAX_TAKE;
      expect(cacheMock.getVersion).toHaveBeenCalledWith("v:follows:list");

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        `follows:list:v3:${expectedTake}`,
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.follow.findMany).toHaveBeenCalledWith({
        take: expectedTake,
        orderBy: { id: "desc" },
        select: SafeFollowSelect,
      });

      expect(res).toEqual([{ id: 10, followerId: 1, followingId: 2 }]);
    });

    it("defaults take to PAGINATION.DEFAULT_TAKE", async () => {
      cacheMock.getVersion.mockResolvedValue(1);
      prismaMock.follow.findMany.mockResolvedValue([]);

      await service.findFollows();

      expect(prismaMock.follow.findMany).toHaveBeenCalledWith({
        take: PAGINATION.DEFAULT_TAKE,
        orderBy: { id: "desc" },
        select: SafeFollowSelect,
      });
    });
  });

  describe("getFollow", () => {
    it("returns follow from cache factory and throws NotFound when not found", async () => {
      prismaMock.follow.findUnique.mockResolvedValue(null);

      await expect(service.getFollow(123)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(cacheMock.getOrSet).toHaveBeenCalledWith(
        "follow:detail:123",
        expect.any(Function),
        30_000,
      );

      expect(prismaMock.follow.findUnique).toHaveBeenCalledWith({
        where: { id: 123 },
        select: SafeFollowSelect,
      });
    });

    it("returns follow when found", async () => {
      const follow = { id: 1, followerId: 10, followingId: 20 };
      prismaMock.follow.findUnique.mockResolvedValue(follow);

      const res = await service.getFollow(1);

      expect(res).toEqual(follow);
    });
  });

  describe("createFollow", () => {
    it("throws BadRequest when user tries to follow themselves", async () => {
      await expect(service.createFollow(5, 5)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.follow.create).not.toHaveBeenCalled();
    });

    it("throws NotFound when target user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.createFollow(1, 999)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
        where: { id: 999 },
        select: { id: true },
      });

      expect(prismaMock.follow.create).not.toHaveBeenCalled();
    });

    it("creates follow and bumps/invalidates caches on success", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });

      const created = { id: 50, followerId: 1, followingId: 2 };
      prismaMock.follow.create.mockResolvedValue(created);

      const res = await service.createFollow(1, 2);

      expect(prismaMock.follow.create).toHaveBeenCalledWith({
        data: { followerId: 1, followingId: 2 },
        select: SafeFollowSelect,
      });

      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:follows:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:2");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual(created);
    });

    it("throws ConflictException on unique constraint (P2002)", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });

      const err = new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      });
      prismaMock.follow.create.mockRejectedValue(err);

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it("throws NotFoundException on FK/record errors (P2003 or P2025)", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });

      const err1 = new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      });
      prismaMock.follow.create.mockRejectedValue(err1);

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      const err2 = new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.follow.create.mockRejectedValue(err2);

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws InternalServerErrorException for unknown errors", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.follow.create.mockRejectedValue(new Error("boom"));

      await expect(service.createFollow(1, 2)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe("deleteFollow", () => {
    it("deletes by followingId when relation id is not provided", async () => {
      prismaMock.follow.findUnique
        .mockResolvedValueOnce({
          id: 55,
          followerId: 1,
          followingId: 2,
        })
        .mockResolvedValueOnce(null);

      prismaMock.follow.delete.mockResolvedValue({ id: 55 });

      const res = await service.deleteFollow(2, 1);

      expect(prismaMock.follow.delete).toHaveBeenCalledWith({
        where: { id: 55 },
      });

      expect(res).toEqual({ message: "Follow deleted successfully" });
    });

    it("throws NotFound if follow does not exist", async () => {
      prismaMock.follow.findUnique.mockResolvedValue(null);

      await expect(service.deleteFollow(10, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.follow.delete).not.toHaveBeenCalled();
    });

    it("throws Forbidden if current user is not the follower", async () => {
      prismaMock.follow.findUnique.mockResolvedValue({
        id: 10,
        followerId: 999,
        followingId: 2,
      });

      await expect(service.deleteFollow(10, 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      expect(prismaMock.follow.delete).not.toHaveBeenCalled();
    });

    it("deletes follow and invalidates caches on success", async () => {
      prismaMock.follow.findUnique.mockResolvedValue({
        id: 10,
        followerId: 1,
        followingId: 2,
      });

      prismaMock.follow.delete.mockResolvedValue({ id: 10 });

      const res = await service.deleteFollow(10, 1);

      expect(prismaMock.follow.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });

      expect(cacheMock.del).toHaveBeenCalledWith("follow:detail:10");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:follows:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:2");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");

      expect(res).toEqual({ message: "Follow deleted successfully" });
    });

    it("throws NotFound when Prisma delete fails with P2025 (race condition)", async () => {
      prismaMock.follow.findUnique.mockResolvedValue({
        id: 10,
        followerId: 1,
        followingId: 2,
      });

      const err = new Prisma.PrismaClientKnownRequestError("gone", {
        code: "P2025",
        clientVersion: "test",
      });
      prismaMock.follow.delete.mockRejectedValue(err);

      await expect(service.deleteFollow(10, 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws InternalServerErrorException for unexpected errors", async () => {
      prismaMock.follow.findUnique.mockRejectedValue(new Error("boom"));

      await expect(service.deleteFollow(10, 1)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });
});

import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PrismaService } from "@/prisma/prisma.service";
import { SafeUserSelect } from "@/users/dto/safe-user.dto";

import { BlocksService } from "./blocks.service";

describe("BlocksService", () => {
  let service: BlocksService;
  let moduleRef: TestingModule;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    follow: {
      findMany: jest.fn(),
    },
    followRequest: {
      findMany: jest.fn(),
    },
    userBlock: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const txMock = {
    userBlock: {
      upsert: jest.fn(),
    },
    follow: {
      deleteMany: jest.fn(),
    },
    followRequest: {
      deleteMany: jest.fn(),
    },
  };

  const cacheMock = {
    del: jest.fn(),
    bumpVersion: jest.fn(),
  };

  const makeSafeUser = (id: number) => ({
    id,
    name: `User ${id}`,
    username: `user${id}`,
    privacySetting: "PUBLIC",
    accountState: "ACTIVE",
    isEmailVerified: true,
    createdAt: new Date(`2026-04-0${id}T00:00:00.000Z`),
    updatedAt: new Date(`2026-04-1${id}T00:00:00.000Z`),
    _count: {
      likes: 1,
      posts: 2,
      followers: 3,
      following: 4,
    },
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: typeof txMock) => Promise<unknown>) =>
        callback(txMock),
    );

    moduleRef = await Test.createTestingModule({
      providers: [
        BlocksService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
      ],
    }).compile();

    service = moduleRef.get(BlocksService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("blockUser", () => {
    it("rejects self-blocking", async () => {
      await expect(service.blockUser(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("throws NotFound when the target user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.blockUser(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.follow.findMany).not.toHaveBeenCalled();
    });

    it("creates an idempotent block, removes follow edges, and invalidates caches", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.follow.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
      prismaMock.followRequest.findMany.mockResolvedValue([]);

      await expect(service.blockUser(1, 2)).resolves.toEqual({
        message: "User blocked successfully",
      });

      expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
      expect(txMock.userBlock.upsert).toHaveBeenCalledWith({
        where: {
          blockerId_blockedId: {
            blockerId: 1,
            blockedId: 2,
          },
        },
        update: {},
        create: {
          blockerId: 1,
          blockedId: 2,
        },
      });
      expect(txMock.follow.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { followerId: 1, followingId: 2 },
            { followerId: 2, followingId: 1 },
          ],
        },
      });
      expect(txMock.followRequest.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { requesterId: 1, targetUserId: 2 },
            { requesterId: 2, targetUserId: 1 },
          ],
        },
      });
      expect(cacheMock.del).toHaveBeenCalledWith("follow:detail:10");
      expect(cacheMock.del).toHaveBeenCalledWith("follow:detail:11");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:follows:list");
      expect(cacheMock.bumpVersion).toHaveBeenCalledWith("v:user:list");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:2");
    });

    it("returns the same success message on repeated block requests", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.follow.findMany.mockResolvedValue([]);
      prismaMock.followRequest.findMany.mockResolvedValue([]);

      await expect(service.blockUser(1, 2)).resolves.toEqual({
        message: "User blocked successfully",
      });
      await expect(service.blockUser(1, 2)).resolves.toEqual({
        message: "User blocked successfully",
      });

      expect(txMock.userBlock.upsert).toHaveBeenCalledTimes(2);
    });

    it("does not bump follow caches when there were no follow edges to remove", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.follow.findMany.mockResolvedValue([]);
      prismaMock.followRequest.findMany.mockResolvedValue([]);

      await service.blockUser(1, 2);

      expect(cacheMock.bumpVersion).not.toHaveBeenCalledWith("v:follows:list");
      expect(cacheMock.bumpVersion).not.toHaveBeenCalledWith("v:user:list");
    });

    it("maps known Prisma missing-target errors to NotFound", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.follow.findMany.mockResolvedValue([]);
      prismaMock.followRequest.findMany.mockResolvedValue([]);
      prismaMock.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("missing user", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(service.blockUser(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("throws a sanitized error on unexpected persistence failure", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.follow.findMany.mockResolvedValue([]);
      prismaMock.followRequest.findMany.mockResolvedValue([]);
      prismaMock.$transaction.mockRejectedValueOnce(new Error("boom"));

      const loggerSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      await expect(service.blockUser(1, 2)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        "Unexpected persistence failure while trying to block user",
        expect.any(String),
      );
    });
  });

  describe("unblockUser", () => {
    it("rejects self-unblocking", async () => {
      await expect(service.unblockUser(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prismaMock.userBlock.deleteMany).not.toHaveBeenCalled();
    });

    it("is idempotent and clears affected user caches", async () => {
      prismaMock.userBlock.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unblockUser(1, 2)).resolves.toEqual({
        message: "User unblocked successfully",
      });

      expect(prismaMock.userBlock.deleteMany).toHaveBeenCalledWith({
        where: {
          blockerId: 1,
          blockedId: 2,
        },
      });
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:1");
      expect(cacheMock.del).toHaveBeenCalledWith("user:safe:2");
    });

    it("returns the same success message on repeated unblock requests", async () => {
      prismaMock.userBlock.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unblockUser(1, 2)).resolves.toEqual({
        message: "User unblocked successfully",
      });
      await expect(service.unblockUser(1, 2)).resolves.toEqual({
        message: "User unblocked successfully",
      });

      expect(prismaMock.userBlock.deleteMany).toHaveBeenCalledTimes(2);
    });
  });

  describe("findMyBlockedUsers", () => {
    it("returns a cursor page ordered by newest block first", async () => {
      const rows = [
        {
          id: 50,
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          blocked: makeSafeUser(2),
        },
        {
          id: 49,
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
          blocked: makeSafeUser(3),
        },
      ];
      prismaMock.userBlock.findMany.mockResolvedValue(rows);

      const result = await service.findMyBlockedUsers(1, { first: 1 });

      expect(prismaMock.userBlock.findMany).toHaveBeenCalledWith({
        where: {
          blockerId: 1,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2,
        select: {
          createdAt: true,
          id: true,
          blocked: {
            select: SafeUserSelect,
          },
        },
      });
      expect(result.items).toEqual([makeSafeUser(2)]);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.endCursor).toBe(
        encodeChronoCursor({
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          id: 50,
        }),
      );
    });

    it("applies the block cursor filter", async () => {
      prismaMock.userBlock.findMany.mockResolvedValue([]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-10T00:00:00.000Z"),
        id: 999,
      });

      await service.findMyBlockedUsers(1, { first: 5, after });

      expect(prismaMock.userBlock.findMany).toHaveBeenCalledWith({
        where: {
          blockerId: 1,
          AND: [
            { blockerId: 1 },
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
        select: {
          createdAt: true,
          id: true,
          blocked: {
            select: SafeUserSelect,
          },
        },
      });
    });
  });
});

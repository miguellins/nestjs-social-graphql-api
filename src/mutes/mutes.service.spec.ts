import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { Prisma } from "@prisma/client";

import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { SafeUserSelect } from "@/users/dto/safe-user.dto";
import { HOME_FEED_RELATIONSHIP_HIDE_EVENT } from "@/outbox/events/home-feed-cleanup.event";
import { OutboxService } from "@/outbox/outbox.service";
import { PrismaService } from "@/prisma/prisma.service";

import { MutesService } from "./mutes.service";

describe("MutesService", () => {
  let service: MutesService;
  let moduleRef: TestingModule;

  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    mute: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const cacheMock = {
    bumpVersion: jest.fn(),
  };

  const outboxMock = {
    enqueue: jest.fn(),
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === "MUTES_ENABLED") return true;
      return undefined;
    }),
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

    moduleRef = await Test.createTestingModule({
      providers: [
        MutesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
        { provide: OutboxService, useValue: outboxMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = moduleRef.get(MutesService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("muteUser", () => {
    it("rejects self-mute", async () => {
      await expect(service.muteUser(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    });

    it("throws NotFound when target user does not exist", async () => {
      prismaMock.user.findUnique.mockResolvedValue(null);

      await expect(service.muteUser(1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );

      expect(prismaMock.mute.create).not.toHaveBeenCalled();
    });

    it("creates a mute edge and returns it", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      outboxMock.enqueue.mockResolvedValue({ id: 20 });
      prismaMock.mute.create.mockResolvedValue({
        id: 10,
        muterId: 1,
        mutedUserId: 2,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });

      await expect(service.muteUser(1, 2)).resolves.toEqual({
        id: 10,
        muterId: 1,
        mutedUserId: 2,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });
      await flushBestEffort();

      expect(outboxMock.enqueue).toHaveBeenCalledWith({
        eventType: HOME_FEED_RELATIONSHIP_HIDE_EVENT,
        aggregateType: "user",
        aggregateId: 1,
        payload: {
          userId: 1,
          authorId: 2,
        },
      });
    });

    it("does not enqueue relationship hide when mute already exists", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 3 });
      prismaMock.mute.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      prismaMock.mute.findUnique.mockResolvedValue({
        id: 11,
        muterId: 1,
        mutedUserId: 3,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });

      await expect(service.muteUser(1, 3)).resolves.toEqual({
        id: 11,
        muterId: 1,
        mutedUserId: 3,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });
      await flushBestEffort();

      expect(outboxMock.enqueue).not.toHaveBeenCalled();
    });

    it("treats unique constraint violations as idempotent success", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.mute.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      prismaMock.mute.findUnique.mockResolvedValue({
        id: 11,
        muterId: 1,
        mutedUserId: 2,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });

      await expect(service.muteUser(1, 2)).resolves.toEqual({
        id: 11,
        muterId: 1,
        mutedUserId: 2,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });
    });

    it("throws a sanitized error on unexpected persistence failure", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.mute.create.mockRejectedValueOnce(new Error("boom"));

      await expect(service.muteUser(1, 2)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    });
  });

  describe("unmuteUser", () => {
    it("rejects self-unmute", async () => {
      await expect(service.unmuteUser(1, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it("is idempotent and returns true when no rows were removed", async () => {
      prismaMock.mute.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.unmuteUser(1, 2)).resolves.toBe(true);
      expect(prismaMock.mute.deleteMany).toHaveBeenCalledWith({
        where: { muterId: 1, mutedUserId: 2 },
      });
    });
  });

  describe("findMyMutedUsers", () => {
    it("returns a cursor page ordered by newest mute first", async () => {
      prismaMock.mute.findMany.mockResolvedValue([
        {
          id: 50,
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          mutedUser: makeSafeUser(2),
        },
        {
          id: 49,
          createdAt: new Date("2026-04-09T00:00:00.000Z"),
          mutedUser: makeSafeUser(3),
        },
      ]);

      const result = await service.findMyMutedUsers(1, { first: 1 });

      expect(prismaMock.mute.findMany).toHaveBeenCalledWith({
        where: {
          muterId: 1,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 2,
        select: {
          id: true,
          createdAt: true,
          mutedUser: {
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
  });
});

async function flushBestEffort(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

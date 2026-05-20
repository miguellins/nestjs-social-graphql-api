import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { SafeUserSelect } from "@/users/dto/safe-user.dto";
import { HOME_FEED_RELATIONSHIP_HIDE_EVENT } from "@/outbox/events/home-feed-cleanup.event";
import { OutboxService } from "@/outbox/outbox.service";
import { PrismaService } from "@/prisma/prisma.service";
import { ALL_MUTE_SCOPES, MuteScope } from "@/mutes/enums/mute-scope.enum";

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
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    userBlock: {
      findFirst: jest.fn(),
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
      if (key === "MUTE_SCOPES_ENABLED") return true;
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
    configMock.get.mockImplementation((key: string) => {
      if (key === "MUTES_ENABLED") return true;
      if (key === "MUTE_SCOPES_ENABLED") return true;
      return undefined;
    });
    prismaMock.userBlock.findFirst.mockResolvedValue(null);

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
      prismaMock.mute.findUnique.mockResolvedValue(null);
      prismaMock.mute.create.mockResolvedValue({
        id: 10,
        muterId: 1,
        mutedUserId: 2,
        scopes: ALL_MUTE_SCOPES,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });

      await expect(service.muteUser(1, 2)).resolves.toEqual({
        id: 10,
        muterId: 1,
        mutedUserId: 2,
        scopes: ALL_MUTE_SCOPES,
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

    it("replaces scopes and does not enqueue relationship hide when FEED was already active", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 3 });
      prismaMock.mute.findUnique.mockResolvedValue({
        id: 11,
        muterId: 1,
        mutedUserId: 3,
        scopes: ALL_MUTE_SCOPES,
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });
      prismaMock.mute.update.mockResolvedValue({
        id: 11,
        muterId: 1,
        mutedUserId: 3,
        scopes: [MuteScope.POSTS],
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });

      await expect(service.muteUser(1, 3, [MuteScope.POSTS])).resolves.toEqual({
        id: 11,
        muterId: 1,
        mutedUserId: 3,
        scopes: [MuteScope.POSTS],
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });
      await flushBestEffort();

      expect(prismaMock.mute.update).toHaveBeenCalledWith({
        where: { id: 11 },
        data: { scopes: [MuteScope.POSTS] },
        select: {
          id: true,
          muterId: true,
          mutedUserId: true,
          scopes: true,
          createdAt: true,
        },
      });
      expect(outboxMock.enqueue).not.toHaveBeenCalled();
    });

    it("enqueues relationship hide when FEED is newly added", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.mute.findUnique.mockResolvedValue({
        id: 11,
        muterId: 1,
        mutedUserId: 2,
        scopes: [MuteScope.NOTIFICATIONS],
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });
      prismaMock.mute.update.mockResolvedValue({
        id: 11,
        muterId: 1,
        mutedUserId: 2,
        scopes: [MuteScope.FEED, MuteScope.NOTIFICATIONS],
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });

      await service.muteUser(1, 2, [MuteScope.FEED, MuteScope.NOTIFICATIONS]);
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

    it("does not enqueue relationship hide for notification-only mutes", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.mute.findUnique.mockResolvedValue(null);
      prismaMock.mute.create.mockResolvedValue({
        id: 10,
        muterId: 1,
        mutedUserId: 2,
        scopes: [MuteScope.NOTIFICATIONS],
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
      });

      await service.muteUser(1, 2, [MuteScope.NOTIFICATIONS]);
      await flushBestEffort();

      expect(outboxMock.enqueue).not.toHaveBeenCalled();
    });

    it("rejects mutes when a block exists in either direction", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.userBlock.findFirst.mockResolvedValue({ id: 99 });

      await expect(service.muteUser(1, 2)).rejects.toBeInstanceOf(
        BadRequestException,
      );

      expect(prismaMock.mute.create).not.toHaveBeenCalled();
    });

    it("throws a sanitized error on unexpected persistence failure", async () => {
      prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
      prismaMock.mute.findUnique.mockResolvedValue(null);
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
          muterId: 1,
          mutedUserId: 2,
          scopes: [MuteScope.POSTS],
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          mutedUser: makeSafeUser(2),
        },
        {
          id: 49,
          muterId: 1,
          mutedUserId: 3,
          scopes: [MuteScope.NOTIFICATIONS],
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
          muterId: true,
          mutedUserId: true,
          scopes: true,
          createdAt: true,
          mutedUser: {
            select: SafeUserSelect,
          },
        },
      });
      expect(result.items).toEqual([
        {
          id: 50,
          muterId: 1,
          mutedUserId: 2,
          scopes: [MuteScope.POSTS],
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          mutedUser: makeSafeUser(2),
        },
      ]);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.endCursor).toBe(
        encodeChronoCursor({
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
          id: 50,
        }),
      );
    });
  });

  describe("scope helpers", () => {
    it("uses any active scope for legacy helpers", async () => {
      prismaMock.mute.findUnique.mockResolvedValue({
        scopes: [MuteScope.NOTIFICATIONS],
      });
      prismaMock.mute.findMany.mockResolvedValue([
        { mutedUserId: 2, scopes: [MuteScope.NOTIFICATIONS] },
      ]);

      await expect(service.isMuted(1, 2)).resolves.toBe(true);
      await expect(service.getMutedUserIds(1)).resolves.toEqual([2]);
    });

    it("filters ids by requested scope", async () => {
      prismaMock.mute.findMany.mockResolvedValue([
        { mutedUserId: 2, scopes: [MuteScope.FEED] },
        { mutedUserId: 3, scopes: [MuteScope.NOTIFICATIONS] },
      ]);

      await expect(
        service.getMutedUserIdsForScope(1, MuteScope.FEED),
      ).resolves.toEqual([2]);
    });

    it("fails closed to all scopes for invalid stored JSON", async () => {
      prismaMock.mute.findUnique.mockResolvedValue({
        scopes: ["BROKEN"],
      });

      await expect(
        service.isMutedForScope(1, 2, MuteScope.POSTS),
      ).resolves.toBe(true);
    });
  });

  describe("flag combinations", () => {
    it.each([
      [false, false, false, []],
      [false, true, false, []],
      [true, false, true, [2]],
      [true, true, false, []],
    ])(
      "handles MUTES_ENABLED=%s and MUTE_SCOPES_ENABLED=%s",
      async (mutesEnabled, scopesEnabled, mutedForFeed, expectedFeedIds) => {
        await moduleRef.close();
        configMock.get.mockImplementation((key: string) => {
          if (key === "MUTES_ENABLED") return mutesEnabled;
          if (key === "MUTE_SCOPES_ENABLED") return scopesEnabled;
          return undefined;
        });
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
        prismaMock.mute.findUnique.mockResolvedValue({
          scopes: [MuteScope.NOTIFICATIONS],
        });
        prismaMock.mute.findMany.mockResolvedValue([
          { mutedUserId: 2, scopes: [MuteScope.NOTIFICATIONS] },
        ]);

        await expect(
          service.isMutedForScope(1, 2, MuteScope.FEED),
        ).resolves.toBe(mutedForFeed);
        await expect(
          service.getMutedUserIdsForScope(1, MuteScope.FEED),
        ).resolves.toEqual(expectedFeedIds);
      },
    );
  });
});

async function flushBestEffort(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

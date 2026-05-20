import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { SafeUserSelect } from "@/users/dto/safe-user.dto";

import { NotificationActorPreferencesService } from "@/notifications/notification-actor-preferences.service";

describe("NotificationActorPreferencesService", () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
    notificationActorPreference: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const configMock = {
    get: jest.fn((key: string) => {
      if (key === "MUTES_ENABLED") return true;
      if (key === "NOTIFICATION_ACTOR_SILENCE_ENABLED") return true;
      return undefined;
    }),
  };

  let service: NotificationActorPreferencesService;

  beforeEach(() => {
    jest.clearAllMocks();
    configMock.get.mockImplementation((key: string) => {
      if (key === "MUTES_ENABLED") return true;
      if (key === "NOTIFICATION_ACTOR_SILENCE_ENABLED") return true;
      return undefined;
    });
    service = new NotificationActorPreferencesService(
      prismaMock as never,
      configMock as unknown as ConfigService,
    );
  });

  it("404s actor APIs when either rollout flag is disabled", async () => {
    configMock.get.mockImplementation((key: string) => {
      if (key === "MUTES_ENABLED") return true;
      if (key === "NOTIFICATION_ACTOR_SILENCE_ENABLED") return false;
      return undefined;
    });
    service = new NotificationActorPreferencesService(
      prismaMock as never,
      configMock as unknown as ConfigService,
    );

    await expect(service.silenceActor(1, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("rejects self-silence", async () => {
    await expect(service.silenceActor(1, 1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("persists a disabled per-actor notification preference", async () => {
    const actor = {
      id: 2,
      name: "Actor",
      username: "actor",
      privacySetting: "PUBLIC",
      accountState: "ACTIVE",
      isEmailVerified: true,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      _count: {
        likes: 0,
        posts: 0,
        followers: 0,
        following: 0,
      },
    };
    prismaMock.user.findUnique.mockResolvedValue({ id: 2 });
    prismaMock.notificationActorPreference.upsert.mockResolvedValue({
      id: 10,
      userId: 1,
      actorId: 2,
      notificationsEnabled: false,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      actor,
    });

    await expect(service.silenceActor(1, 2)).resolves.toEqual({
      id: 10,
      userId: 1,
      actorId: 2,
      notificationsEnabled: false,
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      actor,
    });

    expect(prismaMock.notificationActorPreference.upsert).toHaveBeenCalledWith({
      where: {
        userId_actorId: {
          userId: 1,
          actorId: 2,
        },
      },
      create: {
        userId: 1,
        actorId: 2,
        notificationsEnabled: false,
      },
      update: {
        notificationsEnabled: false,
      },
      select: {
        id: true,
        userId: true,
        actorId: true,
        notificationsEnabled: true,
        createdAt: true,
        actor: {
          select: SafeUserSelect,
        },
      },
    });
  });

  it("deletes actor silence rows idempotently", async () => {
    prismaMock.notificationActorPreference.deleteMany.mockResolvedValue({
      count: 0,
    });

    await expect(service.unsilenceActor(1, 2)).resolves.toBe(true);
    expect(
      prismaMock.notificationActorPreference.deleteMany,
    ).toHaveBeenCalledWith({
      where: {
        userId: 1,
        actorId: 2,
      },
    });
  });

  it("returns a cursor page of silenced actors", async () => {
    const actor = {
      id: 2,
      name: "Actor",
      username: "actor",
      privacySetting: "PUBLIC",
      accountState: "ACTIVE",
      isEmailVerified: true,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-02T00:00:00.000Z"),
      _count: {
        likes: 0,
        posts: 0,
        followers: 0,
        following: 0,
      },
    };
    prismaMock.notificationActorPreference.findMany.mockResolvedValue([
      {
        id: 50,
        userId: 1,
        actorId: 2,
        notificationsEnabled: false,
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
        actor,
      },
      {
        id: 49,
        userId: 1,
        actorId: 3,
        notificationsEnabled: false,
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        actor,
      },
    ]);

    const result = await service.findMySilencedActors(1, { first: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.pageInfo.hasNextPage).toBe(true);
    expect(result.pageInfo.endCursor).toBe(
      encodeChronoCursor({
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
        id: 50,
      }),
    );
  });

  it("checks actor silence only when both flags are enabled", async () => {
    prismaMock.notificationActorPreference.findUnique.mockResolvedValue({
      notificationsEnabled: false,
    });

    await expect(service.isActorSilenced(1, 2)).resolves.toBe(true);

    configMock.get.mockImplementation((key: string) => {
      if (key === "MUTES_ENABLED") return false;
      if (key === "NOTIFICATION_ACTOR_SILENCE_ENABLED") return true;
      return undefined;
    });
    service = new NotificationActorPreferencesService(
      prismaMock as never,
      configMock as unknown as ConfigService,
    );

    await expect(service.isActorSilenced(1, 2)).resolves.toBe(false);
  });
});

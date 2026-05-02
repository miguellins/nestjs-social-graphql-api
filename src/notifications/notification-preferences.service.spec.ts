import { Test, TestingModule } from "@nestjs/testing";
import { NotificationType } from "@prisma/client";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { PrismaService } from "@/prisma/prisma.service";

import { NotificationPreferencesService } from "@/notifications/notification-preferences.service";

describe("NotificationPreferencesService", () => {
  let service: NotificationPreferencesService;
  let moduleRef: TestingModule;

  const prismaMock = {
    notificationPreference: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  const cacheMock = {
    getOrSet: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    cacheMock.getOrSet.mockImplementation(
      async (_key: string, factory: () => Promise<unknown>) => factory(),
    );
    cacheMock.del.mockResolvedValue(undefined);

    moduleRef = await Test.createTestingModule({
      providers: [
        NotificationPreferencesService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: CacheHelperService, useValue: cacheMock },
      ],
    }).compile();

    service = moduleRef.get(NotificationPreferencesService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("returns default-on preferences when no row exists and caches the read", async () => {
    prismaMock.notificationPreference.findUnique.mockResolvedValue(null);

    await expect(service.getMyPreferences(1)).resolves.toEqual({
      replyNotificationsEnabled: true,
      followRequestNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
    });
    expect(cacheMock.getOrSet).toHaveBeenCalledWith(
      "user:notificationPrefs:1",
      expect.any(Function),
      600_000,
    );
    expect(prismaMock.notificationPreference.findUnique).toHaveBeenCalledWith({
      where: { userId: 1 },
      select: {
        replyNotificationsEnabled: true,
        followRequestNotificationsEnabled: true,
        mentionNotificationsEnabled: true,
      },
    });
  });

  it("returns cached preferences without loading from Prisma on cache hit", async () => {
    const cached = {
      replyNotificationsEnabled: false,
      followRequestNotificationsEnabled: true,
      mentionNotificationsEnabled: true,
    };
    cacheMock.getOrSet.mockResolvedValue(cached);

    await expect(service.getMyPreferences(1)).resolves.toEqual(cached);
    expect(prismaMock.notificationPreference.findUnique).not.toHaveBeenCalled();
  });

  it("upserts only defined fields and invalidates the detail cache", async () => {
    const preferences = {
      replyNotificationsEnabled: true,
      followRequestNotificationsEnabled: true,
      mentionNotificationsEnabled: false,
    };
    prismaMock.notificationPreference.upsert.mockResolvedValue(preferences);

    await expect(
      service.updateMyPreferences(1, { mentionNotificationsEnabled: false }),
    ).resolves.toEqual(preferences);
    expect(prismaMock.notificationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: 1 },
      create: {
        userId: 1,
        mentionNotificationsEnabled: false,
      },
      update: {
        mentionNotificationsEnabled: false,
      },
      select: {
        replyNotificationsEnabled: true,
        followRequestNotificationsEnabled: true,
        mentionNotificationsEnabled: true,
      },
    });

    await flushBestEffort();

    expect(cacheMock.del).toHaveBeenCalledWith("user:notificationPrefs:1");
  });

  it("maps notification types to preference toggles", async () => {
    cacheMock.getOrSet.mockResolvedValue({
      replyNotificationsEnabled: false,
      followRequestNotificationsEnabled: true,
      mentionNotificationsEnabled: false,
    });

    await expect(
      service.isNotificationTypeEnabled(1, NotificationType.COMMENT_REPLIED),
    ).resolves.toBe(false);
    await expect(
      service.isNotificationTypeEnabled(1, NotificationType.FOLLOW_REQUESTED),
    ).resolves.toBe(true);
    await expect(
      service.isNotificationTypeEnabled(1, NotificationType.POST_MENTIONED),
    ).resolves.toBe(false);
    await expect(
      service.isNotificationTypeEnabled(1, NotificationType.COMMENT_MENTIONED),
    ).resolves.toBe(false);
    await expect(
      service.isNotificationTypeEnabled(1, NotificationType.USER_FOLLOWED),
    ).resolves.toBe(true);
  });
});

async function flushBestEffort(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

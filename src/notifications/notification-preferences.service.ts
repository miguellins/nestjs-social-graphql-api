import { Injectable, Logger } from "@nestjs/common";

import { UpdateNotificationPreferencesInput } from "@/notifications/dto/update-notification-preferences.input";
import { NotificationPreferences } from "@/notifications/models/notification-preferences.model";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { PrismaService } from "@/prisma/prisma.service";
import { NotificationType } from "@prisma/client";

const NOTIFICATION_PREFERENCES_CACHE_TTL_MS = 10 * 60_000;

/** Coordinates user notification preference reads, updates, and cache projection. */
@Injectable()
export class NotificationPreferencesService {
  private readonly logger = new Logger(NotificationPreferencesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  async getMyPreferences(userId: number): Promise<NotificationPreferences> {
    return this.cacheHelper.getOrSet(
      this.getCacheKey(userId),
      async () => this.loadPreferences(userId),
      NOTIFICATION_PREFERENCES_CACHE_TTL_MS,
    );
  }

  async updateMyPreferences(
    userId: number,
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferences> {
    const data = this.buildUpdateData(input);
    const preferences = await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
      select: notificationPreferencesSelect,
    });

    void runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate notification preferences cache for user ${userId}`,
      async () => {
        await this.cacheHelper.del(this.getCacheKey(userId));
      },
    );

    return preferences;
  }

  async isNotificationTypeEnabled(
    userId: number,
    type: NotificationType,
  ): Promise<boolean> {
    const preferences = await this.getMyPreferences(userId);

    switch (type) {
      case NotificationType.COMMENT_REPLIED:
        return preferences.replyNotificationsEnabled;
      case NotificationType.FOLLOW_REQUESTED:
        return preferences.followRequestNotificationsEnabled;
      case NotificationType.POST_MENTIONED:
      case NotificationType.COMMENT_MENTIONED:
        return preferences.mentionNotificationsEnabled;
      default:
        return true;
    }
  }

  private async loadPreferences(
    userId: number,
  ): Promise<NotificationPreferences> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: notificationPreferencesSelect,
    });

    return preferences ?? defaultNotificationPreferences();
  }

  private buildUpdateData(
    input: UpdateNotificationPreferencesInput,
  ): Partial<NotificationPreferences> {
    const data: Partial<NotificationPreferences> = {};

    if (input.replyNotificationsEnabled !== undefined) {
      data.replyNotificationsEnabled = input.replyNotificationsEnabled;
    }
    if (input.followRequestNotificationsEnabled !== undefined) {
      data.followRequestNotificationsEnabled =
        input.followRequestNotificationsEnabled;
    }
    if (input.mentionNotificationsEnabled !== undefined) {
      data.mentionNotificationsEnabled = input.mentionNotificationsEnabled;
    }

    return data;
  }

  private getCacheKey(userId: number): string {
    return `user:notificationPrefs:${userId}`;
  }
}

/** Selects only public notification preference toggle fields. */
export const notificationPreferencesSelect = {
  replyNotificationsEnabled: true,
  followRequestNotificationsEnabled: true,
  mentionNotificationsEnabled: true,
};

function defaultNotificationPreferences(): NotificationPreferences {
  return {
    replyNotificationsEnabled: true,
    followRequestNotificationsEnabled: true,
    mentionNotificationsEnabled: true,
  };
}

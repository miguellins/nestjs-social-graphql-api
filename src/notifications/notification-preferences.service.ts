import { Injectable, Logger } from "@nestjs/common";

import { UpdateNotificationPreferencesInput } from "@/notifications/dto/update-notification-preferences.input";
import { NotificationPreferences } from "@/notifications/models/notification-preferences.model";
import {
  updateNotificationPreferencesCommandSchema,
  type UpdateNotificationPreferencesCommand,
} from "@/notifications/schemas/update-notification-preferences.schema";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
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

  /** Returns the current user's preferences from cache or default-on storage projection. */
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
    const command = parseWithBadRequest(
      updateNotificationPreferencesCommandSchema,
      input,
      "Invalid notification preference update",
    );
    const data = this.buildUpdateData(command);
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

  /** Resolves whether a notification type may create a new persisted row for a user. */
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
      case NotificationType.POST_LIKED:
        return preferences.postLikedNotificationsEnabled;
      case NotificationType.USER_FOLLOWED:
        return preferences.userFollowedNotificationsEnabled;
      default:
        return true;
    }
  }

  /** Loads stored preferences or returns in-code default-on values for lazy materialization. */
  private async loadPreferences(
    userId: number,
  ): Promise<NotificationPreferences> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: notificationPreferencesSelect,
    });

    return preferences ?? defaultNotificationPreferences();
  }

  /** Builds an explicit Prisma update payload from validated preference fields. */
  private buildUpdateData(
    input: UpdateNotificationPreferencesCommand,
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
    if (input.postLikedNotificationsEnabled !== undefined) {
      data.postLikedNotificationsEnabled = input.postLikedNotificationsEnabled;
    }
    if (input.userFollowedNotificationsEnabled !== undefined) {
      data.userFollowedNotificationsEnabled =
        input.userFollowedNotificationsEnabled;
    }

    return data;
  }

  /** Builds the deterministic detail cache key for one user's preferences. */
  private getCacheKey(userId: number): string {
    return `user:notificationPrefs:${userId}`;
  }
}

/** Selects only public notification preference toggle fields. */
export const notificationPreferencesSelect = {
  replyNotificationsEnabled: true,
  followRequestNotificationsEnabled: true,
  mentionNotificationsEnabled: true,
  postLikedNotificationsEnabled: true,
  userFollowedNotificationsEnabled: true,
};

function defaultNotificationPreferences(): NotificationPreferences {
  return {
    replyNotificationsEnabled: true,
    followRequestNotificationsEnabled: true,
    mentionNotificationsEnabled: true,
    postLikedNotificationsEnabled: true,
    userFollowedNotificationsEnabled: true,
  };
}

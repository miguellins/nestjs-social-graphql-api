import { Injectable, Logger } from "@nestjs/common";
import { pubSub } from "@/graphql/pubsub";

import { PrismaService } from "@/prisma.service";
import { PAGINATION } from "@/common/constants/hard-cap.constants";

import { type CreateNotificationInput } from "@/notifications/dto/create-notification.input";
import {
  NotificationSelect,
  type SafeNotificationDTO,
} from "@/notifications/dto/notifications.dto";

type PaginationParams = {
  take?: number;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createAndPublishNotification(
    input: CreateNotificationInput,
  ): Promise<SafeNotificationDTO | null> {
    // Do not create notifications for your own actions
    if (input.recipientId === input.actorId) return null;

    const notification = await this.prisma.notification.create({
      data: {
        recipientId: input.recipientId,
        actorId: input.actorId,
        type: input.type,
        title: input.title,
        body: input.body,
        entityId: input.entityId,
      },

      select: NotificationSelect,
    });

    try {
      await pubSub.publish("notificationReceived", {
        notificationReceived: notification,
      });
    } catch (error) {
      this.logger.error(
        "Failed to publish notification subscription event",
        error instanceof Error ? error.stack : undefined,
      );
    }

    return notification;
  }

  async findMyNotifications(
    userId: number,
    params?: PaginationParams,
  ): Promise<SafeNotificationDTO[]> {
    const limit = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    return this.prisma.notification.findMany({
      where: {
        recipientId: userId,
      },

      orderBy: {
        createdAt: "desc",
      },

      take: limit,

      select: NotificationSelect,
    });
  }

  async getUnreadCount(userId: number): Promise<number> {
    return this.prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    });
  }

  async markAsRead(notificationId: number, userId: number): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: userId,
      },

      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result.count > 0;
  }

  async markAllAsRead(userId: number): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },

      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return result.count > 0;
  }
}

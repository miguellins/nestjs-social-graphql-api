import { Injectable } from "@nestjs/common";

import { pubSub } from "@/graphql/pubsub";
import { PrismaService } from "@/prisma.service";

import {
  NotificationSelect,
  type SafeNotificationDTO,
} from "@/notifications/dto/notifications.dto";
import { type CreateNotificationInput } from "@/notifications/dto/create-notification.input";

@Injectable()
export class NotificationsService {
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
      console.error("Failed to publish notification subscription event", error);
    }

    return notification;
  }

  async findMyNotifications(
    userId: number,
    take = 20,
  ): Promise<SafeNotificationDTO[]> {
    const safeTake = Math.max(1, Math.min(take, 50));

    return this.prisma.notification.findMany({
      where: {
        recipientId: userId,
      },

      orderBy: {
        createdAt: "desc",
      },

      take: safeTake,

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
    await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },

      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return true;
  }
}

import { Injectable, Logger } from "@nestjs/common";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { DeleteResponse } from "@/common/types/delete-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";

import { createNotificationInputSchema } from "@/notifications/schemas/create-notification.schema";
import type { CreateNotificationInput } from "@/notifications/schemas/create-notification.schema";
import { NotificationReadStatus } from "@/notifications/enums/notification-read-status.enum";
import type { SafeNotificationDTO } from "@/notifications/dto/notifications.dto";
import { NotificationSelect } from "@/notifications/dto/notifications.dto";

import { PrismaService } from "@/prisma.service";

/**
 * Service for notification workflows
 *
 * Creates, lists, and updates notifications
 */

type PaginationParams = {
  take?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  // Injects the services used by notification workflows
  constructor(
    private readonly prisma: PrismaService,
    private readonly graphqlPubSub: GraphqlPubSubService,
  ) {}

  // Creates a notification record and publishes it to subscribers
  async createAndPublishNotification(
    input: CreateNotificationInput,
  ): Promise<SafeNotificationDTO | null> {
    const data = parseWithBadRequest(
      createNotificationInputSchema,
      input,
      "Invalid notification input",
    );

    // Do not create notifications for your own actions
    if (data.recipientId === data.actorId) return null;

    const notification = await this.prisma.notification.create({
      data,

      select: NotificationSelect,
    });

    // Keep realtime delivery best-effort because the notification write already succeeded
    await runBestEffort(
      this.logger,
      "error",
      "Failed to publish notification subscription event",
      async () => {
        await this.graphqlPubSub.publish("notificationReceived", {
          notificationReceived: notification,
        });
      },
    );

    return notification;
  }

  // Lists notifications for the current user with optional status filtering
  async findMyNotifications(
    userId: number,
    params?: PaginationParams,
    status: NotificationReadStatus = NotificationReadStatus.ALL,
  ): Promise<SafeNotificationDTO[]> {
    const limit = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Default to newest-first when no explicit chronological order is provided
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    const readFilter =
      status === NotificationReadStatus.READ
        ? { isRead: true }
        : status === NotificationReadStatus.UNREAD
          ? { isRead: false }
          : {};

    return this.prisma.notification.findMany({
      where: {
        recipientId: userId,
        ...readFilter,
      },

      orderBy: {
        createdAt: toSortDirection(orderby),
      },

      take: limit,

      select: NotificationSelect,
    });
  }

  // Returns the unread notification count for a user
  async getUnreadCount(userId: number): Promise<number> {
    return this.prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    });
  }

  // Marks a single notification as read for the current user
  async markAsRead(
    notificationId: number,
    userId: number,
  ): Promise<DeleteResponse> {
    const result = await this.prisma.notification.updateMany({
      where: {
        id: notificationId,
        recipientId: userId,
      },

      data: this.buildReadUpdateData(),
    });

    return {
      message:
        result.count > 0
          ? "Notification marked as read"
          : "Notification not found",
    };
  }

  // Marks all unread notifications as read for the current user
  async markAllAsRead(userId: number): Promise<DeleteResponse> {
    await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },

      data: this.buildReadUpdateData(),
    });

    return {
      message: "All notifications marked as read",
    };
  }

  // Builds the update payload used when marking notifications as read
  private buildReadUpdateData() {
    return {
      isRead: true,
      readAt: new Date(),
    };
  }
}

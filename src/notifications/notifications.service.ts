import { Injectable, Logger } from "@nestjs/common";

import { MessageResponse } from "@/common/types/message-response.type";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { NotificationReadStatus } from "@/notifications/enums/notification-read-status.enum";
import { NotificationDeliveryService } from "@/notifications/notification-delivery.service";
import {
  createNotificationInputSchema,
  type CreateNotificationInput,
} from "@/notifications/schemas/create-notification.schema";
import {
  NotificationSelect,
  type SafeNotificationDTO,
} from "@/notifications/dto/safe-notification.dto";

import { PrismaService } from "@/prisma/prisma.service";

type PaginationParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationDelivery: NotificationDeliveryService,
  ) {}

  // Persists the notification first, then treats realtime delivery as best-effort follow-up work
  async createAndPublishNotification(
    input: CreateNotificationInput,
  ): Promise<SafeNotificationDTO | null> {
    const data = parseWithBadRequest(
      createNotificationInputSchema,
      input,
      "Invalid notification input",
    );

    if (data.recipientId === data.actorId) return null;

    const blockRelationship = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: data.recipientId,
            blockedId: data.actorId,
          },
          {
            blockerId: data.actorId,
            blockedId: data.recipientId,
          },
        ],
      },
      select: { id: true },
    });

    if (blockRelationship) return null;

    const notification = await this.prisma.notification.create({
      data,

      select: NotificationSelect,
    });

    await runBestEffort(
      this.logger,
      "error",
      "Failed to publish notification subscription event",
      async () => {
        await this.notificationDelivery.publishNotificationReceived(
          notification,
        );
      },
    );

    return notification;
  }

  // Lists notifications for the current user with optional status filtering
  async findMyNotifications(
    userId: number,
    params?: PaginationParams,
    status: NotificationReadStatus = NotificationReadStatus.ALL,
  ): Promise<CursorPageResult<SafeNotificationDTO>> {
    const limit = normalizeCursorTake(params?.first);
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    const readFilter =
      status === NotificationReadStatus.READ
        ? { isRead: true }
        : status === NotificationReadStatus.UNREAD
          ? { isRead: false }
          : {};

    const rows = await this.prisma.notification.findMany({
      where: cursorFilter
        ? {
            AND: [
              {
                recipientId: userId,
                ...readFilter,
              },
              cursorFilter,
            ],
          }
        : {
            recipientId: userId,
            ...readFilter,
          },
      orderBy: [
        { createdAt: toSortDirection(orderby) },
        { id: toSortDirection(orderby) },
      ],
      take: limit + 1,
      select: NotificationSelect,
    });

    return buildCursorPage(rows, limit);
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
  ): Promise<MessageResponse> {
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
  async markAllAsRead(userId: number): Promise<MessageResponse> {
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

  // Private Helper
  // Builds the update payload used when marking notifications as read
  private buildReadUpdateData() {
    return {
      isRead: true,
      readAt: new Date(),
    };
  }
}

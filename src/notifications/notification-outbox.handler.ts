import { Injectable } from "@nestjs/common";

import type { CommentReplyNotificationDeliveryPayload } from "@/outbox/events/comment-reply-notification-delivery.event";
import { OutboxPermanentError } from "@/outbox/outbox.errors";

import { NotificationsService } from "@/notifications/notifications.service";

import type { OutboxEvent } from "@prisma/client";

/** Handles durable notification follow-up work after the source notification row already exists. */
@Injectable()
export class NotificationOutboxHandler {
  constructor(private readonly notificationsService: NotificationsService) {}

  async handleCommentReplyDelivery(event: OutboxEvent): Promise<void> {
    const payload =
      event.payload as unknown as CommentReplyNotificationDeliveryPayload;

    const result =
      await this.notificationsService.publishPersistedNotificationIfNeeded(
        payload.notificationId,
      );

    if (result === "missing") {
      throw new OutboxPermanentError(
        `Notification ${payload.notificationId} no longer exists`,
      );
    }
  }
}

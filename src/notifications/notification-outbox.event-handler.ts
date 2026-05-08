import { Injectable } from "@nestjs/common";

import { FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/follow-request-notification-delivery.event";
import { COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/comment-reply-notification-delivery.event";
import type { OutboxDurableEventHandler } from "@/outbox/outbox-handler.types";
import { OutboxPermanentError } from "@/outbox/outbox.errors";

import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";

import type { OutboxEvent } from "@prisma/client";

/** Adapts notification delivery work to the durable outbox handler registry. */
@Injectable()
export class NotificationOutboxEventHandler implements OutboxDurableEventHandler {
  readonly eventTypes = [
    COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT,
    FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT,
  ] as const;

  constructor(
    private readonly notificationOutboxHandler: NotificationOutboxHandler,
  ) {}

  /** Delegates known notification delivery events to the existing feature handler. */
  async handle(event: OutboxEvent): Promise<void> {
    switch (event.eventType) {
      case COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT:
        return this.notificationOutboxHandler.handleCommentReplyDelivery(event);
      case FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT:
        return this.notificationOutboxHandler.handleFollowRequestDelivery(
          event,
        );
      default:
        throw new OutboxPermanentError(
          `Unsupported notification outbox event type ${event.eventType}`,
        );
    }
  }
}

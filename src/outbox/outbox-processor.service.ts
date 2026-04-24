import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/comment-reply-notification-delivery.event";
import { OutboxPermanentError } from "@/outbox/outbox.errors";
import { OutboxService } from "@/outbox/outbox.service";

import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";

import type { OutboxEvent } from "@prisma/client";

/** Claims and processes pending outbox rows, applying retry and failure policies. */
@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly notificationOutboxHandler: NotificationOutboxHandler,
    configService: ConfigService,
  ) {
    this.batchSize = configService.get<number>("OUTBOX_BATCH_SIZE") ?? 20;
    this.maxAttempts = configService.get<number>("OUTBOX_MAX_ATTEMPTS") ?? 10;
  }

  async processNextBatch(): Promise<number> {
    const events = await this.outboxService.claimPendingBatch(this.batchSize);

    for (const event of events) {
      await this.processOne(event);
    }

    return events.length;
  }

  private async processOne(event: OutboxEvent): Promise<void> {
    const startedAt = Date.now();

    try {
      await this.dispatch(event);
      await this.outboxService.markProcessed(event.id);
      this.logger.log("Outbox event processed", {
        eventType: event.eventType,
        eventId: event.id,
        attemptCount: event.attemptCount,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const stack = error instanceof Error ? error.stack : undefined;

      if (error instanceof OutboxPermanentError) {
        await this.outboxService.markFailed(event.id, message);
        this.logger.error(
          "Outbox event failed permanently",
          stack,
          OutboxProcessorService.name,
          {
            eventType: event.eventType,
            eventId: event.id,
            attemptCount: event.attemptCount,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
          },
        );
        return;
      }

      if (event.attemptCount >= this.maxAttempts) {
        await this.outboxService.markFailed(event.id, message);
        this.logger.error(
          "Outbox event exhausted retries",
          stack,
          OutboxProcessorService.name,
          {
            eventType: event.eventType,
            eventId: event.id,
            attemptCount: event.attemptCount,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
          },
        );
        return;
      }

      const availableAt = new Date(
        Date.now() + calculateRetryDelayMs(event.attemptCount),
      );

      await this.outboxService.rescheduleRetry(event.id, message, availableAt);
      this.logger.warn("Outbox event scheduled for retry", {
        eventType: event.eventType,
        eventId: event.id,
        attemptCount: event.attemptCount,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        retryAt: availableAt.toISOString(),
      });
    }
  }

  private async dispatch(event: OutboxEvent): Promise<void> {
    switch (event.eventType) {
      case COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT:
        await this.notificationOutboxHandler.handleCommentReplyDelivery(event);
        return;
      default:
        throw new OutboxPermanentError(
          `Unsupported outbox event type ${event.eventType}`,
        );
    }
  }
}

function calculateRetryDelayMs(attemptCount: number): number {
  const cappedAttempt = Math.max(1, Math.min(attemptCount, 6));
  const baseDelayMs = 500 * 2 ** (cappedAttempt - 1);
  const jitterMs = Math.floor(Math.random() * 250);

  return baseDelayMs + jitterMs;
}

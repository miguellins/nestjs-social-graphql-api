import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/follow-request-notification-delivery.event";
import { COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/comment-reply-notification-delivery.event";
import { HOME_FEED_FOLLOW_BACKFILL_EVENT } from "@/outbox/events/home-feed-follow-backfill.event";
import { HOME_FEED_USER_BOOTSTRAP_EVENT } from "@/outbox/events/home-feed-user-bootstrap.event";
import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import { OutboxPermanentError } from "@/outbox/outbox.errors";
import { OutboxService } from "@/outbox/outbox.service";
import {
  HOME_FEED_POST_CLEANUP_EVENT,
  HOME_FEED_RELATIONSHIP_HIDE_EVENT,
} from "@/outbox/events/home-feed-cleanup.event";

import {
  MetricsRegistryService,
  type OutboxEventOutcome,
} from "@/metrics/metrics-registry.service";

import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";

import { HomeFeedOutboxHandler } from "@/posts/home-feed-outbox.handler";

import type { OutboxEvent } from "@prisma/client";

/** Claims and processes pending outbox rows, applying retry and failure policies. */
@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly feedProjectionWorkerEnabled: boolean;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly notificationOutboxHandler: NotificationOutboxHandler,
    private readonly homeFeedOutboxHandler: HomeFeedOutboxHandler,
    private readonly metricsRegistry: MetricsRegistryService,
    configService: ConfigService,
  ) {
    this.batchSize = configService.get<number>("OUTBOX_BATCH_SIZE") ?? 20;
    this.maxAttempts = configService.get<number>("OUTBOX_MAX_ATTEMPTS") ?? 10;
    this.feedProjectionWorkerEnabled =
      configService.get<boolean>("FEED_PROJECTION_WORKER_ENABLED") ?? false;
  }

  async processNextBatch(): Promise<number> {
    const events = await this.outboxService.claimPendingBatch(this.batchSize);
    this.metricsRegistry.recordOutboxBatchClaimed(events.length);

    for (const event of events) {
      await this.processOne(event);
    }

    return events.length;
  }

  private async processOne(event: OutboxEvent): Promise<void> {
    const startedAt = Date.now();
    const attemptCount = await this.outboxService.bumpAttemptCount(event.id);
    let outcome: OutboxEventOutcome | undefined;

    try {
      const dispatchOutcome = await this.dispatch(event);

      if (dispatchOutcome === "retry_scheduled") {
        outcome = "retry_scheduled";
        return;
      }

      await this.outboxService.markProcessed(event.id);
      outcome = "processed";
      this.logger.log("Outbox event processed", {
        eventType: event.eventType,
        eventId: event.id,
        attemptCount,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        latencyMs: Date.now() - startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const stack = error instanceof Error ? error.stack : undefined;

      if (error instanceof OutboxPermanentError) {
        await this.outboxService.markFailed(event.id, message);
        outcome = "failed_permanent";
        this.logger.error(
          "Outbox event failed permanently",
          stack,
          OutboxProcessorService.name,
          {
            eventType: event.eventType,
            eventId: event.id,
            attemptCount,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
          },
        );
        return;
      }

      if (attemptCount >= this.maxAttempts) {
        await this.outboxService.markFailed(event.id, message);
        outcome = "failed_exhausted";
        this.logger.error(
          "Outbox event exhausted retries",
          stack,
          OutboxProcessorService.name,
          {
            eventType: event.eventType,
            eventId: event.id,
            attemptCount,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
          },
        );
        return;
      }

      const availableAt = new Date(
        Date.now() + calculateRetryDelayMs(attemptCount),
      );

      await this.outboxService.rescheduleRetry(event.id, message, availableAt);
      outcome = "retry_scheduled";
      this.logger.warn("Outbox event scheduled for retry", {
        eventType: event.eventType,
        eventId: event.id,
        attemptCount,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        retryAt: availableAt.toISOString(),
      });
    } finally {
      if (outcome) {
        this.metricsRegistry.recordOutboxEventProcessed(
          event.eventType,
          outcome,
          (Date.now() - startedAt) / 1_000,
        );
      }
    }
  }

  private async dispatch(
    event: OutboxEvent,
  ): Promise<"processed" | "retry_scheduled"> {
    switch (event.eventType) {
      case COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT:
        await this.notificationOutboxHandler.handleCommentReplyDelivery(event);
        return "processed";
      case FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT:
        await this.notificationOutboxHandler.handleFollowRequestDelivery(event);
        return "processed";
      case HOME_FEED_POST_FANOUT_EVENT:
      case HOME_FEED_FOLLOW_BACKFILL_EVENT:
      case HOME_FEED_USER_BOOTSTRAP_EVENT:
      case HOME_FEED_POST_CLEANUP_EVENT:
      case HOME_FEED_RELATIONSHIP_HIDE_EVENT:
        if (!this.feedProjectionWorkerEnabled) {
          // Do not burn retries when the worker is intentionally disabled.
          await this.outboxService.rescheduleRetry(
            event.id,
            "Feed projection worker disabled",
            new Date(Date.now() + 60_000),
          );
          return "retry_scheduled";
        }
        await this.homeFeedOutboxHandler.handle(event);
        return "processed";
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

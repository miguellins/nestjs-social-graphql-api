import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { OutboxHandlerRegistryService } from "@/outbox/outbox-handler-registry.service";
import type { OutboxDispatchOutcome } from "@/outbox/outbox-handler.types";
import { OutboxPermanentError } from "@/outbox/outbox.errors";
import { OutboxService } from "@/outbox/outbox.service";

import {
  MetricsRegistryService,
  type OutboxEventOutcome,
} from "@/metrics/metrics-registry.service";
import { TracingService } from "@/tracing/tracing.service";

import type { OutboxEvent } from "@prisma/client";

/** Claims and processes pending outbox rows, applying retry and failure policies. */
@Injectable()
export class OutboxProcessorService {
  private readonly logger = new Logger(OutboxProcessorService.name);
  private readonly batchSize: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly handlerRegistry: OutboxHandlerRegistryService,
    private readonly metricsRegistry: MetricsRegistryService,
    private readonly tracingService: TracingService,
    configService: ConfigService,
  ) {
    this.batchSize = configService.get<number>("OUTBOX_BATCH_SIZE") ?? 20;
    this.maxAttempts = configService.get<number>("OUTBOX_MAX_ATTEMPTS") ?? 10;
  }

  /** Claims the next batch of available outbox events and processes each row. */
  async processNextBatch(): Promise<number> {
    const events = await this.outboxService.claimPendingBatch(this.batchSize);
    this.metricsRegistry.recordOutboxBatchClaimed(events.length);

    for (const event of events) {
      await this.tracingService.startActiveSpan(
        "outbox.event.process",
        { event_type: event.eventType },
        () => this.processOne(event),
      );
    }

    return events.length;
  }

  /** Applies dispatch, retry, failure, and metrics handling for one outbox row. */
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

  /** Dispatches an outbox row to its registered durable event handler. */
  private async dispatch(event: OutboxEvent): Promise<OutboxDispatchOutcome> {
    const handler = this.handlerRegistry.getHandlerOrUndefined(event.eventType);

    if (!handler) {
      throw new OutboxPermanentError(
        `Unsupported outbox event type ${event.eventType}`,
      );
    }

    const preDispatchOutcome = await handler.preDispatch?.(event);
    if (preDispatchOutcome === "retry_scheduled") {
      return "retry_scheduled";
    }

    await handler.handle(event);

    return "processed";
  }
}

function calculateRetryDelayMs(attemptCount: number): number {
  const cappedAttempt = Math.max(1, Math.min(attemptCount, 6));
  const baseDelayMs = 500 * 2 ** (cappedAttempt - 1);
  const jitterMs = Math.floor(Math.random() * 250);

  return baseDelayMs + jitterMs;
}

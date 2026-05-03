import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";

import type {
  EnqueueOutboxEventInput,
  OutboxEventTypeSummary,
  OutboxMetricsSnapshot,
  OutboxSummary,
} from "@/outbox/outbox.types";
import {
  HOME_FEED_EVENT_TYPES,
  KNOWN_OUTBOX_EVENT_TYPES,
  UNKNOWN_OUTBOX_EVENT_TYPE,
} from "@/outbox/events/known-outbox-event-types";

import { PrismaService } from "@/prisma/prisma.service";
import {
  OutboxEventStatus,
  type OutboxEvent,
  type PrismaClient,
} from "@prisma/client";

type OutboxWriteClient = Pick<PrismaClient, "outboxEvent">;

type OutboxStatusCountGroup = {
  eventType: string;
  _count: {
    _all: number;
  };
};

type OutboxPendingAgeGroup = OutboxStatusCountGroup & {
  _min: {
    availableAt: Date | null;
  };
};

type OutboxProcessingAgeGroup = OutboxStatusCountGroup & {
  _min: {
    updatedAt: Date | null;
  };
};

const OUTBOX_CLAIM_CANDIDATE_MULTIPLIER = 3;

/** Persists, claims, and tracks durable outbox rows used by background workers. */
@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async enqueue(
    input: EnqueueOutboxEventInput,
    client: OutboxWriteClient = this.prisma,
  ): Promise<OutboxEvent> {
    return client.outboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        availableAt: input.availableAt ?? new Date(),
      },
    });
  }

  async claimPendingBatch(limit: number): Promise<OutboxEvent[]> {
    if (limit <= 0) return [];

    const now = new Date();
    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxEventStatus.PENDING,
        availableAt: {
          lte: now,
        },
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: limit * OUTBOX_CLAIM_CANDIDATE_MULTIPLIER,
    });

    const claimed: OutboxEvent[] = [];

    for (const candidate of candidates) {
      if (claimed.length >= limit) break;

      const result = await this.prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: OutboxEventStatus.PENDING,
          availableAt: {
            lte: now,
          },
        },
        data: {
          status: OutboxEventStatus.PROCESSING,
        },
      });

      if (result.count !== 1) continue;

      const row = await this.prisma.outboxEvent.findUnique({
        where: { id: candidate.id },
      });

      if (row) {
        claimed.push(row);
      }
    }

    return claimed;
  }

  /** Increments attemptCount for an already-claimed (PROCESSING) outbox event and returns the updated count. */
  async bumpAttemptCount(id: number): Promise<number> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        id,
        status: OutboxEventStatus.PROCESSING,
      },
      data: {
        attemptCount: {
          increment: 1,
        },
      },
    });

    if (result.count !== 1) {
      // If the row moved out of PROCESSING, treat as no-op.
      const row = await this.prisma.outboxEvent.findUnique({ where: { id } });
      return row?.attemptCount ?? 0;
    }

    const row = await this.prisma.outboxEvent.findUnique({ where: { id } });
    return row?.attemptCount ?? 0;
  }

  async markProcessed(id: number): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  async rescheduleRetry(
    id: number,
    errorMessage: string,
    availableAt: Date,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.PENDING,
        availableAt,
        lastError: errorMessage,
      },
    });
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.FAILED,
        lastError: errorMessage,
      },
    });
  }

  async purgeExpiredEvents(): Promise<void> {
    const processedRetentionHours =
      this.configService.get<number>("OUTBOX_PROCESSED_RETENTION_HOURS") ?? 24;
    const failedRetentionHours =
      this.configService.get<number>("OUTBOX_FAILED_RETENTION_HOURS") ?? 168;

    const processedCutoff = new Date(
      Date.now() - processedRetentionHours * 60 * 60_000,
    );
    const failedCutoff = new Date(
      Date.now() - failedRetentionHours * 60 * 60_000,
    );

    await this.prisma.$transaction([
      this.prisma.outboxEvent.deleteMany({
        where: {
          status: OutboxEventStatus.PROCESSED,
          processedAt: {
            lt: processedCutoff,
          },
        },
      }),
      this.prisma.outboxEvent.deleteMany({
        where: {
          status: OutboxEventStatus.FAILED,
          updatedAt: {
            lt: failedCutoff,
          },
        },
      }),
    ]);
  }

  async getSummary(): Promise<OutboxSummary> {
    const workerEnabled =
      this.configService.get<boolean>("OUTBOX_ENABLED") ?? false;
    const commentReplyOutboxEnabled =
      this.configService.get<boolean>("OUTBOX_COMMENT_REPLIED_ENABLED") ??
      false;
    const followRequestOutboxEnabled =
      this.configService.get<boolean>("OUTBOX_FOLLOW_REQUESTED_ENABLED") ??
      false;
    const feedProjection = this.getFeedProjectionSummaryFlags();
    const [
      pendingCount,
      failedCount,
      oldestPending,
      feedPendingCount,
      feedFailedCount,
      feedOldestPending,
      byEventType,
    ] = await Promise.all([
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.PENDING },
      }),
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.FAILED },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxEventStatus.PENDING },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          availableAt: true,
        },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: OutboxEventStatus.PENDING,
          eventType: { in: [...HOME_FEED_EVENT_TYPES] },
        },
      }),
      this.prisma.outboxEvent.count({
        where: {
          status: OutboxEventStatus.FAILED,
          eventType: { in: [...HOME_FEED_EVENT_TYPES] },
        },
      }),
      this.prisma.outboxEvent.findFirst({
        where: {
          status: OutboxEventStatus.PENDING,
          eventType: { in: [...HOME_FEED_EVENT_TYPES] },
        },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          availableAt: true,
        },
      }),
      this.getEventTypeSummary(),
    ]);

    return {
      enabled:
        workerEnabled ||
        commentReplyOutboxEnabled ||
        followRequestOutboxEnabled ||
        feedProjection.enabled,
      pendingCount,
      failedCount,
      byEventType,
      oldestPendingAgeMs: oldestPending
        ? Math.max(0, Date.now() - oldestPending.availableAt.getTime())
        : null,
      feedProjection: {
        ...feedProjection,
        pendingCount: feedPendingCount,
        failedCount: feedFailedCount,
        oldestPendingAgeMs: feedOldestPending
          ? Math.max(0, Date.now() - feedOldestPending.availableAt.getTime())
          : null,
      },
    };
  }

  /** Builds the event-type-aware outbox summary from grouped durable row state. */
  private async getEventTypeSummary(): Promise<
    Record<string, OutboxEventTypeSummary>
  > {
    const [pendingGroups, failedGroups, processingGroups] = await Promise.all([
      this.prisma.outboxEvent.groupBy({
        by: ["eventType"],
        where: { status: OutboxEventStatus.PENDING },
        _count: { _all: true },
        _min: { availableAt: true },
      }),
      this.prisma.outboxEvent.groupBy({
        by: ["eventType"],
        where: { status: OutboxEventStatus.FAILED },
        _count: { _all: true },
      }),
      this.prisma.outboxEvent.groupBy({
        by: ["eventType"],
        where: { status: OutboxEventStatus.PROCESSING },
        _count: { _all: true },
        _min: { updatedAt: true },
      }),
    ]);
    const summary = this.buildEmptyEventTypeSummary();
    const now = Date.now();

    this.mergePendingEventTypeGroups(
      summary,
      pendingGroups as OutboxPendingAgeGroup[],
      now,
    );
    this.mergeFailedEventTypeGroups(
      summary,
      failedGroups as OutboxStatusCountGroup[],
    );
    this.mergeProcessingEventTypeGroups(
      summary,
      processingGroups as OutboxProcessingAgeGroup[],
      now,
    );

    return summary;
  }

  /** Builds the complete known event-type summary map with zeroed counters. */
  private buildEmptyEventTypeSummary(): Record<string, OutboxEventTypeSummary> {
    return Object.fromEntries(
      [...KNOWN_OUTBOX_EVENT_TYPES, UNKNOWN_OUTBOX_EVENT_TYPE].map(
        (eventType) => [
          eventType,
          {
            pendingCount: 0,
            failedCount: 0,
            processingCount: 0,
            oldestPendingAgeMs: null,
            oldestProcessingAgeMs: null,
          },
        ],
      ),
    );
  }

  /** Merges pending event-type count and oldest-available age groups into the summary. */
  private mergePendingEventTypeGroups(
    summary: Record<string, OutboxEventTypeSummary>,
    groups: OutboxPendingAgeGroup[],
    now: number,
  ): void {
    for (const group of groups) {
      const bucket = this.getEventTypeBucket(summary, group.eventType);

      bucket.pendingCount += group._count._all;
      bucket.oldestPendingAgeMs = minNullableNumber(
        bucket.oldestPendingAgeMs,
        group._min.availableAt
          ? Math.max(0, now - group._min.availableAt.getTime())
          : null,
      );
    }
  }

  /** Merges failed event-type count groups into the summary. */
  private mergeFailedEventTypeGroups(
    summary: Record<string, OutboxEventTypeSummary>,
    groups: OutboxStatusCountGroup[],
  ): void {
    for (const group of groups) {
      const bucket = this.getEventTypeBucket(summary, group.eventType);

      bucket.failedCount += group._count._all;
    }
  }

  /** Merges processing event-type count and oldest-updated age groups into the summary. */
  private mergeProcessingEventTypeGroups(
    summary: Record<string, OutboxEventTypeSummary>,
    groups: OutboxProcessingAgeGroup[],
    now: number,
  ): void {
    for (const group of groups) {
      const bucket = this.getEventTypeBucket(summary, group.eventType);

      bucket.processingCount += group._count._all;
      bucket.oldestProcessingAgeMs = minNullableNumber(
        bucket.oldestProcessingAgeMs,
        group._min.updatedAt
          ? Math.max(0, now - group._min.updatedAt.getTime())
          : null,
      );
    }
  }

  /** Resolves an event-type summary bucket, falling back to the unknown rollup. */
  private getEventTypeBucket(
    summary: Record<string, OutboxEventTypeSummary>,
    eventType: string,
  ): OutboxEventTypeSummary {
    return summary[eventType] ?? summary[UNKNOWN_OUTBOX_EVENT_TYPE]!;
  }

  /** Reads feed-projection rollout flags for the outbox readiness summary. */
  private getFeedProjectionSummaryFlags(): Pick<
    OutboxSummary["feedProjection"],
    | "backfillEnabled"
    | "enabled"
    | "enqueueEnabled"
    | "purgeEnabled"
    | "readEnabled"
    | "workerEnabled"
  > {
    const enqueueEnabled =
      this.configService.get<boolean>("FEED_PROJECTION_ENQUEUE_ENABLED") ??
      false;
    const workerEnabled =
      this.configService.get<boolean>("FEED_PROJECTION_WORKER_ENABLED") ??
      false;
    const readEnabled =
      this.configService.get<boolean>("FEED_PROJECTION_READ_ENABLED") ?? false;
    const backfillEnabled =
      this.configService.get<boolean>("FEED_PROJECTION_BACKFILL_ENABLED") ??
      false;
    const purgeEnabled =
      this.configService.get<boolean>("FEED_PROJECTION_PURGE_ENABLED") ?? false;

    return {
      enabled:
        enqueueEnabled ||
        workerEnabled ||
        readEnabled ||
        backfillEnabled ||
        purgeEnabled,
      enqueueEnabled,
      workerEnabled,
      readEnabled,
      backfillEnabled,
      purgeEnabled,
    };
  }

  async getMetricsSnapshot(): Promise<OutboxMetricsSnapshot> {
    const [
      pendingCount,
      failedCount,
      processingCount,
      oldestPending,
      oldestProcessing,
    ] = await Promise.all([
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.PENDING },
      }),
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.FAILED },
      }),
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.PROCESSING },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxEventStatus.PENDING },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          availableAt: true,
        },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxEventStatus.PROCESSING },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        select: {
          updatedAt: true,
        },
      }),
    ]);

    return {
      pendingCount,
      failedCount,
      processingCount,
      oldestPendingAgeSeconds: oldestPending
        ? Math.max(
            0,
            (Date.now() - oldestPending.availableAt.getTime()) / 1_000,
          )
        : 0,
      oldestProcessingAgeSeconds: oldestProcessing
        ? Math.max(
            0,
            (Date.now() - oldestProcessing.updatedAt.getTime()) / 1_000,
          )
        : 0,
    };
  }
}

/** Returns the lower non-null number while preserving null when both values are null. */
function minNullableNumber(
  current: number | null,
  next: number | null,
): number | null {
  if (next === null) return current;
  if (current === null) return next;

  return Math.min(current, next);
}

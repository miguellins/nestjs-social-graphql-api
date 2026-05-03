import type { Prisma } from "@prisma/client";

/** Defines the persisted outbox event payload written during a source transaction. */
export type EnqueueOutboxEventInput = {
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
};

/** Summarizes durable outbox state for one event-type readiness bucket. */
export type OutboxEventTypeSummary = {
  failedCount: number;
  oldestPendingAgeMs: number | null;
  oldestProcessingAgeMs: number | null;
  pendingCount: number;
  processingCount: number;
};

/** Summarizes current outbox backlog and worker visibility for ops checks. */
export type OutboxSummary = {
  byEventType: Record<string, OutboxEventTypeSummary>;
  enabled: boolean;
  failedCount: number;
  feedProjection: {
    backfillEnabled: boolean;
    enabled: boolean;
    enqueueEnabled: boolean;
    failedCount: number;
    oldestPendingAgeMs: number | null;
    pendingCount: number;
    purgeEnabled: boolean;
    readEnabled: boolean;
    workerEnabled: boolean;
  };
  oldestPendingAgeMs: number | null;
  pendingCount: number;
};

/** Snapshot used to export low-cardinality outbox backlog metrics. */
export type OutboxMetricsSnapshot = {
  failedCount: number;
  oldestPendingAgeSeconds: number;
  oldestProcessingAgeSeconds: number;
  pendingCount: number;
  processingCount: number;
};

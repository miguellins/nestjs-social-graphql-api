import type { Prisma } from "@prisma/client";

/** Defines the persisted outbox event payload written during a source transaction. */
export type EnqueueOutboxEventInput = {
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  payload: Prisma.InputJsonValue;
  availableAt?: Date;
};

/** Summarizes current outbox backlog and worker visibility for ops checks. */
export type OutboxSummary = {
  enabled: boolean;
  failedCount: number;
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

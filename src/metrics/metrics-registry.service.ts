import { Counter, Gauge, Histogram, Registry } from "prom-client";

import { Injectable } from "@nestjs/common";

export type OutboxEventOutcome =
  | "failed_exhausted"
  | "failed_permanent"
  | "processed"
  | "retry_scheduled";

export type HomeFeedCleanupEnqueueOutcome =
  | "enqueued"
  | "failed"
  | "skipped_disabled";

export type HomeFeedProjectionFallbackReason =
  | "missing_hydration_gap"
  | "read_error";

export type HomeFeedReadSource = "legacy" | "projection";

export type HomeFeedShadowMismatchCategory =
  | "has_next_page"
  | "membership"
  | "order";

export type HomeFeedProjectionReconciliationOutcome =
  | "error"
  | "match"
  | "mismatch";

export type OutboxBacklogMetrics = {
  failedCount: number;
  oldestPendingAgeSeconds: number;
  oldestProcessingAgeSeconds: number;
  pendingCount: number;
  processingCount: number;
};

/** Owns the Prometheus registry and stable v1 metric definitions. */
@Injectable()
export class MetricsRegistryService {
  private readonly registry = new Registry();
  private readonly outboxWorkerTicksTotal: Counter<"process">;
  private readonly outboxWorkerTickErrorsTotal: Counter<"process">;
  private readonly outboxEventsTotal: Counter<
    "event_type" | "outcome" | "process"
  >;
  private readonly outboxEventsClaimedTotal: Counter<"process">;
  private readonly outboxEventProcessingSeconds: Histogram<
    "event_type" | "process"
  >;
  private readonly outboxBatchSize: Histogram<"process">;
  private readonly feedProjectionPurgeRunsTotal: Counter<"process">;
  private readonly feedProjectionPurgeErrorsTotal: Counter<"process">;
  private readonly feedProjectionPurgeSeconds: Histogram<"process">;
  private readonly homeFeedShadowCompareTotal: Counter<"process">;
  private readonly homeFeedShadowCompareMismatchByCategoryTotal: Counter<
    "category" | "process"
  >;
  private readonly homeFeedShadowCompareMismatchTotal: Counter<"process">;
  private readonly homeFeedProjectionCleanupEnqueueTotal: Counter<
    "outcome" | "process"
  >;
  private readonly homeFeedProjectionFallbackTotal: Counter<
    "process" | "reason"
  >;
  private readonly homeFeedReadSourceTotal: Counter<"process" | "source">;
  private readonly homeFeedProjectionReconciliationTotal: Counter<
    "category" | "outcome" | "process"
  >;
  private readonly homeFeedProjectionReadLagSeconds: Gauge<"process">;
  private readonly outboxPendingCount: Gauge<"process">;
  private readonly outboxFailedCount: Gauge<"process">;
  private readonly outboxProcessingCount: Gauge<"process">;
  private readonly outboxOldestPendingAgeSeconds: Gauge<"process">;
  private readonly outboxOldestProcessingAgeSeconds: Gauge<"process">;
  private readonly metricsDbLastRefreshTimestampSeconds: Gauge<
    "component" | "process"
  >;
  private readonly metricsDbRefreshErrorsTotal: Counter<
    "component" | "process"
  >;

  constructor() {
    this.outboxWorkerTicksTotal = new Counter({
      name: "outbox_worker_ticks_total",
      help: "Total outbox worker ticks.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxWorkerTickErrorsTotal = new Counter({
      name: "outbox_worker_tick_errors_total",
      help: "Total outbox worker tick failures.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxEventsTotal = new Counter({
      name: "outbox_events_total",
      help: "Total outbox events handled by event type and outcome.",
      labelNames: ["process", "event_type", "outcome"],
      registers: [this.registry],
    });
    this.outboxEventsClaimedTotal = new Counter({
      name: "outbox_events_claimed_total",
      help: "Total outbox events claimed by the worker.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxEventProcessingSeconds = new Histogram({
      name: "outbox_event_processing_seconds",
      help: "Outbox event processing duration in seconds.",
      labelNames: ["process", "event_type"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
      registers: [this.registry],
    });
    this.outboxBatchSize = new Histogram({
      name: "outbox_batch_size",
      help: "Outbox worker claimed batch size.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.feedProjectionPurgeRunsTotal = new Counter({
      name: "feed_projection_purge_runs_total",
      help: "Total home feed projection purge runs.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.feedProjectionPurgeErrorsTotal = new Counter({
      name: "feed_projection_purge_errors_total",
      help: "Total home feed projection purge failures.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.feedProjectionPurgeSeconds = new Histogram({
      name: "feed_projection_purge_seconds",
      help: "Home feed projection purge duration in seconds.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.homeFeedShadowCompareTotal = new Counter({
      name: "home_feed_shadow_compare_total",
      help: "Total home feed shadow comparisons.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.homeFeedShadowCompareMismatchTotal = new Counter({
      name: "home_feed_shadow_compare_mismatch_total",
      help: "Total home feed shadow comparison mismatches.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.homeFeedShadowCompareMismatchByCategoryTotal = new Counter({
      name: "home_feed_shadow_compare_mismatch_by_category_total",
      help: "Total home feed shadow comparison mismatches by category.",
      labelNames: ["process", "category"],
      registers: [this.registry],
    });
    this.homeFeedProjectionCleanupEnqueueTotal = new Counter({
      name: "home_feed_projection_cleanup_enqueue_total",
      help: "Total home feed projection cleanup enqueue attempts by outcome.",
      labelNames: ["process", "outcome"],
      registers: [this.registry],
    });
    this.homeFeedProjectionFallbackTotal = new Counter({
      name: "home_feed_projection_fallback_total",
      help: "Total home feed projection read fallbacks by reason.",
      labelNames: ["process", "reason"],
      registers: [this.registry],
    });
    this.homeFeedReadSourceTotal = new Counter({
      name: "home_feed_read_source_total",
      help: "Total home feed reads by served source.",
      labelNames: ["process", "source"],
      registers: [this.registry],
    });
    this.homeFeedProjectionReconciliationTotal = new Counter({
      name: "home_feed_projection_reconciliation_total",
      help: "Total observe-only home feed projection reconciliation outcomes.",
      labelNames: ["process", "outcome", "category"],
      registers: [this.registry],
    });
    this.homeFeedProjectionReadLagSeconds = new Gauge({
      name: "home_feed_projection_read_lag_seconds",
      help: "Observed age in seconds of the newest entry returned by projection reads.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxPendingCount = new Gauge({
      name: "outbox_pending_count",
      help: "Current pending outbox event count.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxFailedCount = new Gauge({
      name: "outbox_failed_count",
      help: "Current failed outbox event count.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxProcessingCount = new Gauge({
      name: "outbox_processing_count",
      help: "Current processing outbox event count.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxOldestPendingAgeSeconds = new Gauge({
      name: "outbox_oldest_pending_age_seconds",
      help: "Age in seconds of the oldest pending outbox event.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.outboxOldestProcessingAgeSeconds = new Gauge({
      name: "outbox_oldest_processing_age_seconds",
      help: "Age in seconds of the oldest processing outbox event.",
      labelNames: ["process"],
      registers: [this.registry],
    });
    this.metricsDbLastRefreshTimestampSeconds = new Gauge({
      name: "metrics_db_last_refresh_timestamp_seconds",
      help: "Unix timestamp for the last successful DB-backed metrics refresh.",
      labelNames: ["process", "component"],
      registers: [this.registry],
    });
    this.metricsDbRefreshErrorsTotal = new Counter({
      name: "metrics_db_refresh_errors_total",
      help: "Total DB-backed metrics refresh failures.",
      labelNames: ["process", "component"],
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  incrementOutboxWorkerTick(): void {
    this.outboxWorkerTicksTotal.inc({ process: "worker" });
  }

  incrementOutboxWorkerTickError(): void {
    this.outboxWorkerTickErrorsTotal.inc({ process: "worker" });
  }

  recordOutboxBatchClaimed(size: number): void {
    this.outboxBatchSize.observe({ process: "worker" }, size);

    if (size > 0) {
      this.outboxEventsClaimedTotal.inc({ process: "worker" }, size);
    }
  }

  recordOutboxEventProcessed(
    eventType: string,
    outcome: OutboxEventOutcome,
    durationSeconds: number,
  ): void {
    this.outboxEventsTotal.inc({
      process: "worker",
      event_type: eventType,
      outcome,
    });
    this.outboxEventProcessingSeconds.observe(
      { process: "worker", event_type: eventType },
      durationSeconds,
    );
  }

  recordFeedProjectionPurge(durationSeconds: number): void {
    this.feedProjectionPurgeRunsTotal.inc({ process: "worker" });
    this.feedProjectionPurgeSeconds.observe(
      { process: "worker" },
      durationSeconds,
    );
  }

  incrementFeedProjectionPurgeError(): void {
    this.feedProjectionPurgeErrorsTotal.inc({ process: "worker" });
  }

  incrementHomeFeedShadowCompare(): void {
    this.homeFeedShadowCompareTotal.inc({ process: "api" });
  }

  incrementHomeFeedShadowCompareMismatch(): void {
    this.homeFeedShadowCompareMismatchTotal.inc({ process: "api" });
  }

  incrementHomeFeedShadowCompareMismatchByCategory(
    category: HomeFeedShadowMismatchCategory,
  ): void {
    this.homeFeedShadowCompareMismatchByCategoryTotal.inc({
      process: "api",
      category,
    });
  }

  incrementHomeFeedProjectionCleanupEnqueue(
    outcome: HomeFeedCleanupEnqueueOutcome,
  ): void {
    this.homeFeedProjectionCleanupEnqueueTotal.inc({
      process: "api",
      outcome,
    });
  }

  incrementHomeFeedProjectionFallback(
    reason: HomeFeedProjectionFallbackReason,
  ): void {
    this.homeFeedProjectionFallbackTotal.inc({
      process: "api",
      reason,
    });
  }

  incrementHomeFeedReadSource(source: HomeFeedReadSource): void {
    this.homeFeedReadSourceTotal.inc({
      process: "api",
      source,
    });
  }

  recordHomeFeedProjectionReconciliation(
    outcome: HomeFeedProjectionReconciliationOutcome,
    category: HomeFeedShadowMismatchCategory | "none",
    count = 1,
  ): void {
    if (count <= 0) return;

    this.homeFeedProjectionReconciliationTotal.inc(
      {
        process: "worker",
        outcome,
        category,
      },
      count,
    );
  }

  recordHomeFeedProjectionReadLag(lagSeconds: number): void {
    if (!Number.isFinite(lagSeconds) || lagSeconds < 0) return;

    this.homeFeedProjectionReadLagSeconds.set({ process: "api" }, lagSeconds);
  }

  setOutboxBacklogMetrics(metrics: OutboxBacklogMetrics): void {
    this.outboxPendingCount.set({ process: "worker" }, metrics.pendingCount);
    this.outboxFailedCount.set({ process: "worker" }, metrics.failedCount);
    this.outboxProcessingCount.set(
      { process: "worker" },
      metrics.processingCount,
    );
    this.outboxOldestPendingAgeSeconds.set(
      { process: "worker" },
      metrics.oldestPendingAgeSeconds,
    );
    this.outboxOldestProcessingAgeSeconds.set(
      { process: "worker" },
      metrics.oldestProcessingAgeSeconds,
    );
    this.metricsDbLastRefreshTimestampSeconds.set(
      { process: "worker", component: "outbox" },
      Date.now() / 1_000,
    );
  }

  incrementOutboxMetricsRefreshError(): void {
    this.metricsDbRefreshErrorsTotal.inc({
      process: "worker",
      component: "outbox",
    });
  }
}

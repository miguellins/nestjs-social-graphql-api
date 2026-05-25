import { Counter, Gauge, Histogram, Registry } from "prom-client";

import { Injectable, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type MetricsProcessLabel = "api" | "worker";

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

export type NotificationSuppressionReason = "actor" | "mute" | "prefs";

export type GraphqlOperationOutcome =
  | "graphql_error"
  | "internal_error"
  | "success";

export type GraphqlOperationType = "mutation" | "query" | "subscription";

export type CacheOperation = "del" | "get" | "get_or_set" | "set";

export type CacheOperationResult = "error" | "hit" | "miss" | "write";

export type PrismaQueryOutcome =
  | "error"
  | "foreign_key"
  | "not_found"
  | "success"
  | "unique_violation";

export type OutboxBacklogMetrics = {
  failedCount: number;
  oldestPendingAgeSeconds: number;
  oldestProcessingAgeSeconds: number;
  pendingCount: number;
  processingCount: number;
};

const DURATION_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30];

/** Owns the Prometheus registry and stable metric definitions. */
@Injectable()
export class MetricsRegistryService {
  private readonly enabled: boolean;
  private readonly processLabel: MetricsProcessLabel;
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
  private readonly notificationSuppressedTotal: Counter<"process" | "reason">;
  private readonly graphqlOperationsTotal: Counter<
    "operation_name" | "operation_type" | "outcome" | "process"
  >;
  private readonly graphqlOperationDurationSeconds: Histogram<
    "operation_name" | "operation_type" | "process"
  >;
  private readonly graphqlOperationErrorsTotal: Counter<
    "error_code" | "operation_name" | "process"
  >;
  private readonly cacheOperationsTotal: Counter<
    "operation" | "process" | "result"
  >;
  private readonly prismaQueriesTotal: Counter<
    "action" | "model" | "outcome" | "process"
  >;
  private readonly prismaQueryDurationSeconds: Histogram<
    "action" | "model" | "process"
  >;
  private readonly authFailuresTotal: Counter<"process" | "reason">;
  private readonly throttleRejectionsTotal: Counter<"process">;

  constructor(@Optional() configService?: ConfigService) {
    this.enabled = configService?.get<boolean>("METRICS_ENABLED") ?? false;
    this.processLabel =
      process.env.METRICS_PROCESS_LABEL === "worker" ? "worker" : "api";

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
      buckets: DURATION_BUCKETS,
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
    this.notificationSuppressedTotal = new Counter({
      name: "notification_suppressed_total",
      help: "Total notifications suppressed before persistence by reason.",
      labelNames: ["process", "reason"],
      registers: [this.registry],
    });
    this.graphqlOperationsTotal = new Counter({
      name: "graphql_operations_total",
      help: "Total GraphQL operations by operation metadata and outcome.",
      labelNames: ["process", "operation_name", "operation_type", "outcome"],
      registers: [this.registry],
    });
    this.graphqlOperationDurationSeconds = new Histogram({
      name: "graphql_operation_duration_seconds",
      help: "GraphQL operation duration in seconds.",
      labelNames: ["process", "operation_name", "operation_type"],
      buckets: DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.graphqlOperationErrorsTotal = new Counter({
      name: "graphql_operation_errors_total",
      help: "Total GraphQL operation errors by allowlisted public code.",
      labelNames: ["process", "operation_name", "error_code"],
      registers: [this.registry],
    });
    this.cacheOperationsTotal = new Counter({
      name: "cache_operations_total",
      help: "Total cache helper operations by result.",
      labelNames: ["process", "operation", "result"],
      registers: [this.registry],
    });
    this.prismaQueriesTotal = new Counter({
      name: "prisma_queries_total",
      help: "Total Prisma queries by model, action, and outcome.",
      labelNames: ["process", "model", "action", "outcome"],
      registers: [this.registry],
    });
    this.prismaQueryDurationSeconds = new Histogram({
      name: "prisma_query_duration_seconds",
      help: "Prisma query duration in seconds.",
      labelNames: ["process", "model", "action"],
      buckets: DURATION_BUCKETS,
      registers: [this.registry],
    });
    this.authFailuresTotal = new Counter({
      name: "auth_failures_total",
      help: "Total authentication and authorization failures.",
      labelNames: ["process", "reason"],
      registers: [this.registry],
    });
    this.throttleRejectionsTotal = new Counter({
      name: "throttle_rejections_total",
      help: "Total throttled requests rejected by the API.",
      labelNames: ["process"],
      registers: [this.registry],
    });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  /** Renders the current Prometheus exposition text. */
  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  /** Records a successful outbox worker tick. */
  incrementOutboxWorkerTick(): void {
    if (!this.enabled) return;

    this.outboxWorkerTicksTotal.inc({ process: "worker" });
  }

  /** Records a failed outbox worker tick. */
  incrementOutboxWorkerTickError(): void {
    if (!this.enabled) return;

    this.outboxWorkerTickErrorsTotal.inc({ process: "worker" });
  }

  /** Records the number of outbox events claimed by a worker batch. */
  recordOutboxBatchClaimed(size: number): void {
    if (!this.enabled) return;

    this.outboxBatchSize.observe({ process: "worker" }, size);

    if (size > 0) {
      this.outboxEventsClaimedTotal.inc({ process: "worker" }, size);
    }
  }

  /** Records an outbox event outcome and processing duration. */
  recordOutboxEventProcessed(
    eventType: string,
    outcome: OutboxEventOutcome,
    durationSeconds: number,
  ): void {
    if (!this.enabled) return;

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

  /** Records a completed home feed projection purge run. */
  recordFeedProjectionPurge(durationSeconds: number): void {
    if (!this.enabled) return;

    this.feedProjectionPurgeRunsTotal.inc({ process: "worker" });
    this.feedProjectionPurgeSeconds.observe(
      { process: "worker" },
      durationSeconds,
    );
  }

  /** Records a home feed projection purge failure. */
  incrementFeedProjectionPurgeError(): void {
    if (!this.enabled) return;

    this.feedProjectionPurgeErrorsTotal.inc({ process: "worker" });
  }

  /** Records a home feed shadow comparison. */
  incrementHomeFeedShadowCompare(): void {
    if (!this.enabled) return;

    this.homeFeedShadowCompareTotal.inc({ process: "api" });
  }

  /** Records a home feed shadow comparison mismatch. */
  incrementHomeFeedShadowCompareMismatch(): void {
    if (!this.enabled) return;

    this.homeFeedShadowCompareMismatchTotal.inc({ process: "api" });
  }

  /** Records a home feed shadow comparison mismatch by category. */
  incrementHomeFeedShadowCompareMismatchByCategory(
    category: HomeFeedShadowMismatchCategory,
  ): void {
    if (!this.enabled) return;

    this.homeFeedShadowCompareMismatchByCategoryTotal.inc({
      process: "api",
      category,
    });
  }

  /** Records a home feed projection cleanup enqueue outcome. */
  incrementHomeFeedProjectionCleanupEnqueue(
    outcome: HomeFeedCleanupEnqueueOutcome,
  ): void {
    if (!this.enabled) return;

    this.homeFeedProjectionCleanupEnqueueTotal.inc({
      process: "api",
      outcome,
    });
  }

  /** Records a home feed projection fallback reason. */
  incrementHomeFeedProjectionFallback(
    reason: HomeFeedProjectionFallbackReason,
  ): void {
    if (!this.enabled) return;

    this.homeFeedProjectionFallbackTotal.inc({
      process: "api",
      reason,
    });
  }

  /** Records the source used to serve a home feed read. */
  incrementHomeFeedReadSource(source: HomeFeedReadSource): void {
    if (!this.enabled) return;

    this.homeFeedReadSourceTotal.inc({
      process: "api",
      source,
    });
  }

  /** Records observe-only home feed projection reconciliation outcomes. */
  recordHomeFeedProjectionReconciliation(
    outcome: HomeFeedProjectionReconciliationOutcome,
    category: HomeFeedShadowMismatchCategory | "none",
    count = 1,
  ): void {
    if (!this.enabled) return;
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

  /** Records lag for the newest entry served by projection reads. */
  recordHomeFeedProjectionReadLag(lagSeconds: number): void {
    if (!this.enabled) return;
    if (!Number.isFinite(lagSeconds) || lagSeconds < 0) return;

    this.homeFeedProjectionReadLagSeconds.set({ process: "api" }, lagSeconds);
  }

  /** Sets DB-backed outbox backlog gauges from the latest refresh. */
  setOutboxBacklogMetrics(metrics: OutboxBacklogMetrics): void {
    if (!this.enabled) return;

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

  /** Records a failed DB-backed outbox metric refresh. */
  incrementOutboxMetricsRefreshError(): void {
    if (!this.enabled) return;

    this.metricsDbRefreshErrorsTotal.inc({
      process: "worker",
      component: "outbox",
    });
  }

  /** Records a notification suppressed before persistence for a low-cardinality reason. */
  incrementNotificationSuppressed(reason: NotificationSuppressionReason): void {
    if (!this.enabled) return;

    this.notificationSuppressedTotal.inc({
      process: "api",
      reason,
    });
  }

  /** Records a completed GraphQL operation with low-cardinality metadata. */
  recordGraphqlOperation(
    operationName: string,
    operationType: GraphqlOperationType,
    outcome: GraphqlOperationOutcome,
    durationSeconds: number,
  ): void {
    if (!this.enabled) return;

    this.graphqlOperationsTotal.inc({
      process: "api",
      operation_name: operationName,
      operation_type: operationType,
      outcome,
    });
    this.graphqlOperationDurationSeconds.observe(
      {
        process: "api",
        operation_name: operationName,
        operation_type: operationType,
      },
      durationSeconds,
    );
  }

  /** Records an allowlisted public GraphQL error code for an operation. */
  incrementGraphqlOperationError(
    operationName: string,
    errorCode: string,
  ): void {
    if (!this.enabled) return;

    this.graphqlOperationErrorsTotal.inc({
      process: "api",
      operation_name: operationName,
      error_code: errorCode,
    });
  }

  /** Records a cache helper operation result without key cardinality. */
  incrementCacheOperation(
    operation: CacheOperation,
    result: CacheOperationResult,
  ): void {
    if (!this.enabled) return;

    this.cacheOperationsTotal.inc({
      process: this.processLabel,
      operation,
      result,
    });
  }

  /** Records a Prisma query outcome and duration without argument cardinality. */
  recordPrismaQuery(
    model: string,
    action: string,
    outcome: PrismaQueryOutcome,
    durationSeconds: number,
  ): void {
    if (!this.enabled) return;

    this.prismaQueriesTotal.inc({
      process: this.processLabel,
      model,
      action,
      outcome,
    });
    this.prismaQueryDurationSeconds.observe(
      {
        process: this.processLabel,
        model,
        action,
      },
      durationSeconds,
    );
  }

  /** Records an authentication or authorization failure. */
  incrementAuthFailure(reason: "forbidden" | "unauthorized"): void {
    if (!this.enabled) return;

    this.authFailuresTotal.inc({
      process: "api",
      reason,
    });
  }

  /** Records a throttled request rejected by the API. */
  incrementThrottleRejection(): void {
    if (!this.enabled) return;

    this.throttleRejectionsTotal.inc({ process: "api" });
  }
}

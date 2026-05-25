import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxService } from "@/outbox/outbox.service";

import { HomeFeedProjectionService } from "@/posts/home-feed-projection.service";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import { TracingService } from "@/tracing/tracing.service";

const FEED_PROJECTION_RECONCILIATION_INTERVAL_MS = 10 * 60 * 1_000;
const FEED_PROJECTION_RECONCILIATION_SAMPLE_SIZE = 25;
const FEED_PROJECTION_RECONCILIATION_PAGE_SIZE = 100;

/** Runs the configured polling loop that processes durable outbox events. */
@Injectable()
export class OutboxWorkerService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private readonly feedProjectionWorkerEnabled: boolean;
  private readonly feedProjectionPurgeEnabled: boolean;
  private readonly feedProjectionPurgeIntervalMs: number;
  private readonly metricsDbRefreshIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isShuttingDown = false;
  private lastFeedProjectionPurgeAtMs = 0;
  private lastFeedProjectionReconciliationAtMs = 0;
  private lastMetricsDbRefreshAtMs = 0;

  constructor(
    configService: ConfigService,
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly outboxService: OutboxService,
    private readonly homeFeedProjection: HomeFeedProjectionService,
    private readonly metricsRegistry: MetricsRegistryService,
    private readonly tracingService: TracingService,
  ) {
    const processRole =
      configService.get<string>("OUTBOX_PROCESS_ROLE") ?? "api";

    this.enabled =
      processRole === "worker" &&
      (configService.get<boolean>("OUTBOX_ENABLED") ?? false);
    this.pollIntervalMs =
      configService.get<number>("OUTBOX_POLL_INTERVAL_MS") ?? 1_000;
    this.feedProjectionWorkerEnabled =
      configService.get<boolean>("FEED_PROJECTION_WORKER_ENABLED") ?? false;
    this.feedProjectionPurgeEnabled =
      configService.get<boolean>("FEED_PROJECTION_PURGE_ENABLED") ?? false;
    this.feedProjectionPurgeIntervalMs =
      configService.get<number>("FEED_PROJECTION_PURGE_INTERVAL_MS") ?? 60_000;
    this.metricsDbRefreshIntervalMs =
      configService.get<number>("METRICS_DB_REFRESH_INTERVAL_MS") ?? 15_000;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.scheduleNextTick(0);
  }

  onModuleDestroy(): void {
    this.isShuttingDown = true;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTick(delayMs: number): void {
    if (this.isShuttingDown) return;

    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (this.isRunning || this.isShuttingDown) {
      this.scheduleNextTick(this.pollIntervalMs);
      return;
    }

    this.isRunning = true;

    await this.tracingService.startActiveSpan("outbox.worker.tick", {}, () =>
      this.runTickWork(),
    );
  }

  /** Runs one outbox worker tick and records metrics/logs for the attempt. */
  private async runTickWork(): Promise<void> {
    this.metricsRegistry.incrementOutboxWorkerTick();

    try {
      const processedCount = await this.outboxProcessor.processNextBatch();
      await this.outboxService.purgeExpiredEvents();
      await this.maybePurgeHomeFeedProjection();
      await this.maybeReconcileHomeFeedProjection();

      if (processedCount > 0) {
        this.logger.log("Outbox worker processed batch", {
          processedCount,
        });
      }
    } catch (error) {
      this.logger.error(
        "Outbox worker tick failed",
        error instanceof Error ? error.stack : undefined,
        OutboxWorkerService.name,
      );
      this.metricsRegistry.incrementOutboxWorkerTickError();
    } finally {
      await this.maybeRefreshOutboxMetrics();
      this.isRunning = false;
      this.scheduleNextTick(this.pollIntervalMs);
    }
  }

  private async maybeRefreshOutboxMetrics(): Promise<void> {
    const now = Date.now();
    if (
      this.lastMetricsDbRefreshAtMs > 0 &&
      now - this.lastMetricsDbRefreshAtMs < this.metricsDbRefreshIntervalMs
    ) {
      return;
    }

    try {
      const metrics = await this.outboxService.getMetricsSnapshot();
      this.metricsRegistry.setOutboxBacklogMetrics(metrics);
      this.lastMetricsDbRefreshAtMs = now;
    } catch (error) {
      this.metricsRegistry.incrementOutboxMetricsRefreshError();
      this.logger.error(
        "Failed to refresh outbox metrics",
        error instanceof Error ? error.stack : undefined,
        OutboxWorkerService.name,
      );
    }
  }

  private async maybePurgeHomeFeedProjection(): Promise<void> {
    if (!this.feedProjectionWorkerEnabled) return;
    if (!this.feedProjectionPurgeEnabled) return;

    const now = Date.now();
    if (
      this.lastFeedProjectionPurgeAtMs > 0 &&
      now - this.lastFeedProjectionPurgeAtMs <
        this.feedProjectionPurgeIntervalMs
    ) {
      return;
    }

    this.lastFeedProjectionPurgeAtMs = now;
    const startedAt = Date.now();

    try {
      await this.homeFeedProjection.purgeExpiredEntries();
      this.metricsRegistry.recordFeedProjectionPurge(
        (Date.now() - startedAt) / 1_000,
      );
    } catch (error) {
      this.metricsRegistry.incrementFeedProjectionPurgeError();
      this.logger.error(
        "Home feed projection purge failed",
        error instanceof Error ? error.stack : undefined,
        OutboxWorkerService.name,
      );
    }
  }

  private async maybeReconcileHomeFeedProjection(): Promise<void> {
    if (!this.feedProjectionWorkerEnabled) return;

    const now = Date.now();
    if (
      this.lastFeedProjectionReconciliationAtMs > 0 &&
      now - this.lastFeedProjectionReconciliationAtMs <
        FEED_PROJECTION_RECONCILIATION_INTERVAL_MS
    ) {
      return;
    }

    this.lastFeedProjectionReconciliationAtMs = now;

    try {
      const result = await this.homeFeedProjection.reconcileSampledUsers({
        sampleSize: FEED_PROJECTION_RECONCILIATION_SAMPLE_SIZE,
        pageSize: FEED_PROJECTION_RECONCILIATION_PAGE_SIZE,
      });

      this.metricsRegistry.recordHomeFeedProjectionReconciliation(
        "match",
        "none",
        result.matched,
      );

      const mismatchCounts = new Map<string, number>();
      for (const mismatch of result.mismatches) {
        mismatchCounts.set(
          mismatch.category,
          (mismatchCounts.get(mismatch.category) ?? 0) + 1,
        );
      }

      for (const [category, count] of mismatchCounts) {
        this.metricsRegistry.recordHomeFeedProjectionReconciliation(
          "mismatch",
          category as (typeof result.mismatches)[number]["category"],
          count,
        );
      }
    } catch (error) {
      this.metricsRegistry.recordHomeFeedProjectionReconciliation(
        "error",
        "none",
      );
      this.logger.error(
        "Home feed projection reconciliation failed",
        error instanceof Error ? error.stack : undefined,
        OutboxWorkerService.name,
      );
    }
  }
}

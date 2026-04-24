import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxService } from "@/outbox/outbox.service";

/** Runs the configured polling loop that processes durable outbox events. */
@Injectable()
export class OutboxWorkerService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private readonly enabled: boolean;
  private readonly pollIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private isShuttingDown = false;

  constructor(
    configService: ConfigService,
    private readonly outboxProcessor: OutboxProcessorService,
    private readonly outboxService: OutboxService,
  ) {
    this.enabled = configService.get<boolean>("OUTBOX_ENABLED") ?? false;
    this.pollIntervalMs =
      configService.get<number>("OUTBOX_POLL_INTERVAL_MS") ?? 1_000;
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

    try {
      const processedCount = await this.outboxProcessor.processNextBatch();
      await this.outboxService.purgeExpiredEvents();

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
    } finally {
      this.isRunning = false;
      this.scheduleNextTick(this.pollIntervalMs);
    }
  }
}

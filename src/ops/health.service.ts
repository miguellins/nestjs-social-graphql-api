import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";

import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { OutboxService } from "@/outbox/outbox.service";

import { PrismaService } from "@/prisma/prisma.service";

type HealthStatus = "error" | "ok";

type HealthCheckResult = {
  status: HealthStatus;
  durationMs: number;
  errorName?: string;
};

type HealthChecks = Record<string, HealthCheckResult>;

type HealthSummary = {
  cacheRedisConfigured: boolean;
  dedicatedPubsubRedis: boolean;
  outbox: {
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
  pubsubRedisConfigured: boolean;
};

type HealthResponse = {
  status: HealthStatus;
  timestamp: string;
  checks: HealthChecks;
  durationMs: number;
  summary?: HealthSummary;
};

type TimedCheck = {
  durationMs: number;
  error?: Error;
};

/** Provides cheap liveness and dependency-aware readiness checks for operations. */
@Injectable()
export class HealthService {
  private static readonly READINESS_TIMEOUT_MS = 1_000;
  private readonly logger = new Logger(HealthService.name);
  private bootCompleted = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly graphqlPubSub: GraphqlPubSubService,
    private readonly configService: ConfigService,
    private readonly outboxService: OutboxService,
  ) {}

  markBootCompleted(): void {
    this.bootCompleted = true;
  }

  liveness(): HealthResponse {
    const startedAt = Date.now();
    const checks: HealthChecks = {
      app: {
        status: this.bootCompleted ? "ok" : "error",
        durationMs: 0,
        ...(this.bootCompleted ? {} : { errorName: "BootNotCompleted" }),
      },
    };

    return {
      status: this.bootCompleted ? "ok" : "error",
      timestamp: new Date().toISOString(),
      checks,
      durationMs: Date.now() - startedAt,
    };
  }

  async readiness(): Promise<HealthResponse> {
    const startedAt = Date.now();
    const [database, cache, pubsub, outbox] = await Promise.all([
      this.runCheck("database", async () => {
        await this.prisma.$queryRaw`SELECT 1`;
      }),
      this.runCheck("cache", async () => {
        await this.cacheHelper.ping();
      }),
      this.runCheck("pubsub", async () => {
        await this.graphqlPubSub.ping();
      }),
      this.getOutboxSummary(),
    ]);

    const checks: HealthChecks = {
      database,
      cache,
      pubsub,
    };
    const status = Object.values(checks).every((check) => check.status === "ok")
      ? "ok"
      : "error";

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
      durationMs: Date.now() - startedAt,
      summary: this.getSummary(outbox),
    };
  }

  private async runCheck(
    name: string,
    operation: () => Promise<void>,
  ): Promise<HealthCheckResult> {
    const result = await this.runTimed(operation);

    if (!result.error) {
      return {
        status: "ok",
        durationMs: result.durationMs,
      };
    }

    this.logger.error(
      `Readiness check failed for ${name}`,
      result.error.stack,
      HealthService.name,
    );

    return {
      status: "error",
      durationMs: result.durationMs,
      errorName: result.error.name,
    };
  }

  private async runTimed(operation: () => Promise<void>): Promise<TimedCheck> {
    const startedAt = Date.now();

    try {
      await Promise.race([
        operation(),
        createTimeoutPromise(HealthService.READINESS_TIMEOUT_MS),
      ]);

      return {
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      return {
        durationMs: Date.now() - startedAt,
        error: toHealthError(error),
      };
    }
  }

  private getSummary(outbox: HealthSummary["outbox"]): HealthSummary {
    const redisUrl = this.configService.get<string>("REDIS_URL");
    const pubsubRedisUrl =
      this.configService.get<string>("GRAPHQL_SUBSCRIPTIONS_REDIS_URL") ??
      redisUrl;

    return {
      cacheRedisConfigured: Boolean(redisUrl),
      pubsubRedisConfigured: Boolean(pubsubRedisUrl),
      dedicatedPubsubRedis: Boolean(
        pubsubRedisUrl && pubsubRedisUrl !== redisUrl,
      ),
      outbox,
    };
  }

  private async getOutboxSummary(): Promise<HealthSummary["outbox"]> {
    try {
      return await this.outboxService.getSummary();
    } catch (error) {
      this.logger.error(
        "Failed to read outbox readiness summary",
        error instanceof Error ? error.stack : undefined,
        HealthService.name,
      );

      return {
        enabled: false,
        pendingCount: 0,
        failedCount: 0,
        oldestPendingAgeMs: null,
        feedProjection: {
          enabled: false,
          enqueueEnabled: false,
          workerEnabled: false,
          readEnabled: false,
          backfillEnabled: false,
          purgeEnabled: false,
          pendingCount: 0,
          failedCount: 0,
          oldestPendingAgeMs: null,
        },
      };
    }
  }
}

function createTimeoutPromise(timeoutMs: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new InternalServerErrorException("Health check timed out"));
    }, timeoutMs);
  });
}

function toHealthError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error("Unknown health check failure");
}

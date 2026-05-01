import { InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";
import { HealthService } from "@/ops/health.service";
import { OutboxService } from "@/outbox/outbox.service";
import { PrismaService } from "@/prisma/prisma.service";

describe("HealthService", () => {
  let service: HealthService;
  const queryRawMock = jest.fn();
  const cachePingMock = jest.fn();
  const pubsubPingMock = jest.fn();

  const prismaMock = {
    $queryRaw: queryRawMock,
  } as unknown as PrismaService;
  const cacheHelperMock = {
    ping: cachePingMock,
  } as unknown as CacheHelperService;
  const graphqlPubSubMock = {
    ping: pubsubPingMock,
  } as unknown as GraphqlPubSubService;
  const outboxServiceMock = {
    getSummary: jest.fn().mockResolvedValue({
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
    }),
  } as unknown as OutboxService;
  const configServiceMock = {
    get: jest.fn((key: string) => {
      switch (key) {
        case "REDIS_URL":
          return "redis://cache";
        case "GRAPHQL_SUBSCRIPTIONS_REDIS_URL":
          return "redis://pubsub";
        default:
          return undefined;
      }
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    queryRawMock.mockResolvedValue([{ 1: 1 }]);
    cachePingMock.mockResolvedValue(undefined);
    pubsubPingMock.mockResolvedValue("PONG");

    service = new HealthService(
      prismaMock,
      cacheHelperMock,
      graphqlPubSubMock,
      configServiceMock,
      outboxServiceMock,
    );
    service.markBootCompleted();
  });

  it("reports liveness based only on boot completion", () => {
    const result = service.liveness();

    expect(result).toMatchObject({
      status: "ok",
      checks: {
        app: {
          status: "ok",
        },
      },
    });
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(cachePingMock).not.toHaveBeenCalled();
  });

  it("reports liveness as unhealthy before boot completion", () => {
    const unbootedService = new HealthService(
      prismaMock,
      cacheHelperMock,
      graphqlPubSubMock,
      configServiceMock,
      outboxServiceMock,
    );

    const result = unbootedService.liveness();

    expect(result).toMatchObject({
      status: "error",
      checks: {
        app: {
          status: "error",
          errorName: "BootNotCompleted",
        },
      },
    });
    expect(queryRawMock).not.toHaveBeenCalled();
    expect(cachePingMock).not.toHaveBeenCalled();
    expect(pubsubPingMock).not.toHaveBeenCalled();
  });

  it("reports readiness when all critical dependencies are available", async () => {
    const result = await service.readiness();

    expect(result).toMatchObject({
      status: "ok",
      checks: {
        database: { status: "ok" },
        cache: { status: "ok" },
        pubsub: { status: "ok" },
      },
      summary: {
        cacheRedisConfigured: true,
        pubsubRedisConfigured: true,
        dedicatedPubsubRedis: true,
        outbox: {
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
        },
      },
    });
  });

  it("maps dependency failures to unhealthy readiness with sanitized check errors", async () => {
    cachePingMock.mockRejectedValue(
      new InternalServerErrorException("cache unavailable"),
    );
    const loggerSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    const result = await service.readiness();

    expect(result.status).toBe("error");
    expect(result.checks.cache).toMatchObject({
      status: "error",
      errorName: "InternalServerErrorException",
    });
    expect(loggerSpy).toHaveBeenCalledWith(
      "Readiness check failed for cache",
      expect.any(String),
      "HealthService",
    );
  });

  it("reports summary flags when Redis URLs are not configured or shared", async () => {
    const configWithoutRedis = {
      get: jest.fn(),
    } as unknown as ConfigService;

    const healthService = new HealthService(
      prismaMock,
      cacheHelperMock,
      graphqlPubSubMock,
      configWithoutRedis,
      outboxServiceMock,
    );
    healthService.markBootCompleted();

    const result = await healthService.readiness();

    expect(result.summary).toEqual({
      cacheRedisConfigured: false,
      pubsubRedisConfigured: false,
      dedicatedPubsubRedis: false,
      outbox: {
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
      },
    });
  });

  it("marks timed out checks as unhealthy without throwing", async () => {
    jest.useFakeTimers();
    cachePingMock.mockImplementation(() => new Promise<void>(() => undefined));
    const loggerSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    const readinessPromise = service.readiness();

    await jest.advanceTimersByTimeAsync(1_100);

    const result = await readinessPromise;

    expect(result.status).toBe("error");
    expect(result.checks.cache).toMatchObject({
      status: "error",
      errorName: "InternalServerErrorException",
    });
    expect(loggerSpy).toHaveBeenCalledWith(
      "Readiness check failed for cache",
      expect.any(String),
      "HealthService",
    );
  });
});

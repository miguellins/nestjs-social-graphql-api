import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxService } from "@/outbox/outbox.service";
import { OutboxWorkerService } from "@/outbox/outbox-worker.service";
import { HomeFeedProjectionService } from "@/posts/home-feed-projection.service";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

describe("OutboxWorkerService", () => {
  const outboxProcessorMock = {
    processNextBatch: jest.fn(),
  };
  const outboxServiceMock = {
    getMetricsSnapshot: jest.fn(),
    purgeExpiredEvents: jest.fn(),
  };
  const homeFeedProjectionMock = {
    purgeExpiredEntries: jest.fn(),
  };
  const metricsRegistryMock = {
    incrementFeedProjectionPurgeError: jest.fn(),
    incrementOutboxWorkerTick: jest.fn(),
    incrementOutboxWorkerTickError: jest.fn(),
    incrementOutboxMetricsRefreshError: jest.fn(),
    recordFeedProjectionPurge: jest.fn(),
    setOutboxBacklogMetrics: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    outboxProcessorMock.processNextBatch.mockResolvedValue(0);
    outboxServiceMock.getMetricsSnapshot.mockResolvedValue({
      failedCount: 0,
      oldestPendingAgeSeconds: 0,
      oldestProcessingAgeSeconds: 0,
      pendingCount: 0,
      processingCount: 0,
    });
    outboxServiceMock.purgeExpiredEvents.mockResolvedValue(undefined);
    homeFeedProjectionMock.purgeExpiredEntries.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("does not start polling when the worker is disabled", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return false;
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(outboxProcessorMock.processNextBatch).not.toHaveBeenCalled();
    expect(outboxServiceMock.purgeExpiredEvents).not.toHaveBeenCalled();
    expect(
      metricsRegistryMock.incrementOutboxWorkerTick,
    ).not.toHaveBeenCalled();
  });

  it("does not start polling in the API process even when outbox is enabled", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
          case "OUTBOX_PROCESS_ROLE":
            return "api";
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(outboxProcessorMock.processNextBatch).not.toHaveBeenCalled();
    expect(outboxServiceMock.purgeExpiredEvents).not.toHaveBeenCalled();
    expect(
      metricsRegistryMock.incrementOutboxWorkerTick,
    ).not.toHaveBeenCalled();
  });

  it("processes one batch and purges expired rows when enabled", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
          case "OUTBOX_PROCESS_ROLE":
            return "worker";
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    outboxProcessorMock.processNextBatch.mockResolvedValue(1);

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(outboxProcessorMock.processNextBatch).toHaveBeenCalledTimes(1);
    expect(outboxServiceMock.purgeExpiredEvents).toHaveBeenCalledTimes(1);
    expect(metricsRegistryMock.incrementOutboxWorkerTick).toHaveBeenCalledTimes(
      1,
    );
    expect(metricsRegistryMock.setOutboxBacklogMetrics).toHaveBeenCalledWith({
      failedCount: 0,
      oldestPendingAgeSeconds: 0,
      oldestProcessingAgeSeconds: 0,
      pendingCount: 0,
      processingCount: 0,
    });
  });

  it("stops scheduling new ticks after shutdown", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
          case "OUTBOX_PROCESS_ROLE":
            return "worker";
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    const service = moduleRef.get(OutboxWorkerService);

    service.onModuleInit();
    service.onModuleDestroy();
    await jest.runOnlyPendingTimersAsync();

    expect(outboxProcessorMock.processNextBatch).not.toHaveBeenCalled();
    expect(outboxServiceMock.purgeExpiredEvents).not.toHaveBeenCalled();
  });

  it("records tick errors without stopping the polling loop", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
          case "OUTBOX_PROCESS_ROLE":
            return "worker";
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    outboxProcessorMock.processNextBatch.mockRejectedValue(
      new Error("db down"),
    );

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(metricsRegistryMock.incrementOutboxWorkerTick).toHaveBeenCalledTimes(
      1,
    );
    expect(
      metricsRegistryMock.incrementOutboxWorkerTickError,
    ).toHaveBeenCalledTimes(1);
  });

  it("keeps the worker alive when DB-backed metrics refresh fails", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
          case "OUTBOX_PROCESS_ROLE":
            return "worker";
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    outboxServiceMock.getMetricsSnapshot.mockRejectedValue(
      new Error("db down"),
    );

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(
      metricsRegistryMock.incrementOutboxMetricsRefreshError,
    ).toHaveBeenCalledTimes(1);
    expect(metricsRegistryMock.setOutboxBacklogMetrics).not.toHaveBeenCalled();
  });

  it("clamps DB-backed metrics refresh frequency", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
          case "OUTBOX_PROCESS_ROLE":
            return "worker";
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          case "METRICS_DB_REFRESH_INTERVAL_MS":
            return 15_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();
    await jest.advanceTimersByTimeAsync(1_000);

    expect(outboxProcessorMock.processNextBatch).toHaveBeenCalledTimes(2);
    expect(outboxServiceMock.getMetricsSnapshot).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(14_000);

    expect(outboxServiceMock.getMetricsSnapshot).toHaveBeenCalledTimes(2);
  });

  it("records feed projection purge success and failure metrics", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
          case "OUTBOX_PROCESS_ROLE":
            return "worker";
          case "OUTBOX_POLL_INTERVAL_MS":
            return 1_000;
          case "FEED_PROJECTION_WORKER_ENABLED":
            return true;
          case "FEED_PROJECTION_PURGE_ENABLED":
            return true;
          case "FEED_PROJECTION_PURGE_INTERVAL_MS":
            return 1_000;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxWorkerService,
        { provide: ConfigService, useValue: configServiceMock },
        { provide: OutboxProcessorService, useValue: outboxProcessorMock },
        { provide: OutboxService, useValue: outboxServiceMock },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        {
          provide: HomeFeedProjectionService,
          useValue: homeFeedProjectionMock,
        },
      ],
    }).compile();

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(metricsRegistryMock.recordFeedProjectionPurge).toHaveBeenCalledWith(
      expect.any(Number),
    );

    homeFeedProjectionMock.purgeExpiredEntries.mockRejectedValue(
      new Error("db down"),
    );

    await jest.advanceTimersByTimeAsync(1_000);

    expect(
      metricsRegistryMock.incrementFeedProjectionPurgeError,
    ).toHaveBeenCalledTimes(1);
  });
});

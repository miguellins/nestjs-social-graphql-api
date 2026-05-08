import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { OutboxPermanentError } from "@/outbox/outbox.errors";
import { OutboxHandlerRegistryService } from "@/outbox/outbox-handler-registry.service";
import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxService } from "@/outbox/outbox.service";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import { OutboxEventStatus, type OutboxEvent } from "@prisma/client";

describe("OutboxProcessorService", () => {
  const outboxServiceMock = {
    claimPendingBatch: jest.fn(),
    bumpAttemptCount: jest.fn(),
    markFailed: jest.fn(),
    markProcessed: jest.fn(),
    rescheduleRetry: jest.fn(),
  };
  const handlerMock = {
    eventTypes: ["notification.commentReply.deliver"],
    handle: jest.fn(),
    preDispatch: jest.fn(),
  };
  const handlerRegistryMock = {
    getHandlerOrUndefined: jest.fn(),
  };
  const metricsRegistryMock = {
    recordOutboxBatchClaimed: jest.fn(),
    recordOutboxEventProcessed: jest.fn(),
  };
  const configServiceMock = {
    get: jest.fn((key: string) => {
      switch (key) {
        case "OUTBOX_BATCH_SIZE":
          return 20;
        case "OUTBOX_MAX_ATTEMPTS":
          return 3;
        default:
          return undefined;
      }
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    outboxServiceMock.claimPendingBatch.mockResolvedValue([]);
    outboxServiceMock.bumpAttemptCount.mockResolvedValue(1);
    handlerRegistryMock.getHandlerOrUndefined.mockReturnValue(handlerMock);
    handlerMock.handle.mockResolvedValue(undefined);
    handlerMock.preDispatch.mockResolvedValue("continue");
  });

  it("marks events processed after successful handler execution", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);

    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 1,
        eventType: "notification.commentReply.deliver",
        aggregateType: "notification",
        aggregateId: 42,
        payload: { notificationId: 42 },
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await service.processNextBatch();

    expect(result).toBe(1);
    expect(handlerRegistryMock.getHandlerOrUndefined).toHaveBeenCalledWith(
      "notification.commentReply.deliver",
    );
    expect(handlerMock.handle).toHaveBeenCalledTimes(1);
    expect(outboxServiceMock.markProcessed).toHaveBeenCalledWith(1);
    expect(metricsRegistryMock.recordOutboxBatchClaimed).toHaveBeenCalledWith(
      1,
    );
    expect(metricsRegistryMock.recordOutboxEventProcessed).toHaveBeenCalledWith(
      "notification.commentReply.deliver",
      "processed",
      expect.any(Number),
    );
  });

  it("marks permanent failures without retrying", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);

    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 1,
        eventType: "notification.commentReply.deliver",
        aggregateType: "notification",
        aggregateId: 42,
        payload: { notificationId: 42 },
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    handlerMock.handle.mockRejectedValue(new OutboxPermanentError("missing"));

    await service.processNextBatch();

    expect(outboxServiceMock.markFailed).toHaveBeenCalledWith(1, "missing");
    expect(outboxServiceMock.rescheduleRetry).not.toHaveBeenCalled();
    expect(metricsRegistryMock.recordOutboxEventProcessed).toHaveBeenCalledWith(
      "notification.commentReply.deliver",
      "failed_permanent",
      expect.any(Number),
    );
  });

  it("reschedules retryable failures before max attempts", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);

    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 1,
        eventType: "notification.commentReply.deliver",
        aggregateType: "notification",
        aggregateId: 42,
        payload: { notificationId: 42 },
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    handlerMock.handle.mockRejectedValue(new Error("redis down"));

    await service.processNextBatch();

    expect(outboxServiceMock.rescheduleRetry).toHaveBeenCalledWith(
      1,
      "redis down",
      expect.any(Date),
    );
    expect(outboxServiceMock.markFailed).not.toHaveBeenCalled();
    expect(metricsRegistryMock.recordOutboxEventProcessed).toHaveBeenCalledWith(
      "notification.commentReply.deliver",
      "retry_scheduled",
      expect.any(Number),
    );
  });

  it("dispatches follow-request delivery events through the registered handler", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);

    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 7,
        eventType: "notification.followRequest.deliver",
        aggregateType: "notification",
        aggregateId: 88,
        payload: { notificationId: 88 },
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await service.processNextBatch();

    expect(handlerRegistryMock.getHandlerOrUndefined).toHaveBeenCalledWith(
      "notification.followRequest.deliver",
    );
    expect(handlerMock.handle).toHaveBeenCalledTimes(1);
    expect(outboxServiceMock.markProcessed).toHaveBeenCalledWith(7);
  });

  it("dispatches home-feed events through the registered handler", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);

    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 9,
        eventType: "feed.home.post.fanout",
        aggregateType: "post",
        aggregateId: 123,
        payload: { postId: 123 },
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await service.processNextBatch();

    expect(handlerRegistryMock.getHandlerOrUndefined).toHaveBeenCalledWith(
      "feed.home.post.fanout",
    );
    expect(handlerMock.handle).toHaveBeenCalledTimes(1);
    expect(outboxServiceMock.markProcessed).toHaveBeenCalledWith(9);
  });

  it("marks exhausted retry failures and records the exhausted outcome", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);

    outboxServiceMock.bumpAttemptCount.mockResolvedValue(3);
    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 1,
        eventType: "notification.commentReply.deliver",
        aggregateType: "notification",
        aggregateId: 42,
        payload: { notificationId: 42 },
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 2,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    handlerMock.handle.mockRejectedValue(new Error("redis down"));

    await service.processNextBatch();

    expect(outboxServiceMock.markFailed).toHaveBeenCalledWith(1, "redis down");
    expect(outboxServiceMock.rescheduleRetry).not.toHaveBeenCalled();
    expect(metricsRegistryMock.recordOutboxEventProcessed).toHaveBeenCalledWith(
      "notification.commentReply.deliver",
      "failed_exhausted",
      expect.any(Number),
    );
  });

  it("records disabled feed projection events as retry scheduled", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);
    handlerMock.preDispatch.mockImplementation(async (event: OutboxEvent) => {
      await outboxServiceMock.rescheduleRetry(
        event.id,
        "Feed projection worker disabled",
        new Date(Date.now() + 60_000),
      );

      return "retry_scheduled";
    });

    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 9,
        eventType: "feed.home.post.fanout",
        aggregateType: "post",
        aggregateId: 123,
        payload: { postId: 123 },
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await service.processNextBatch();

    expect(handlerMock.handle).not.toHaveBeenCalled();
    expect(outboxServiceMock.rescheduleRetry).toHaveBeenCalledWith(
      9,
      "Feed projection worker disabled",
      expect.any(Date),
    );
    expect(outboxServiceMock.markProcessed).not.toHaveBeenCalled();
    expect(metricsRegistryMock.recordOutboxEventProcessed).toHaveBeenCalledWith(
      "feed.home.post.fanout",
      "retry_scheduled",
      expect.any(Number),
    );
  });

  it("marks unsupported event types as permanent failures", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: OutboxHandlerRegistryService,
          useValue: handlerRegistryMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxProcessorService);
    handlerRegistryMock.getHandlerOrUndefined.mockReturnValue(undefined);

    outboxServiceMock.claimPendingBatch.mockResolvedValue([
      {
        id: 11,
        eventType: "unknown.event",
        aggregateType: "unknown",
        aggregateId: 123,
        payload: {},
        status: OutboxEventStatus.PROCESSING,
        availableAt: new Date(),
        attemptCount: 1,
        processedAt: null,
        lastError: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    await service.processNextBatch();

    expect(outboxServiceMock.markFailed).toHaveBeenCalledWith(
      11,
      "Unsupported outbox event type unknown.event",
    );
    expect(outboxServiceMock.rescheduleRetry).not.toHaveBeenCalled();
  });
});

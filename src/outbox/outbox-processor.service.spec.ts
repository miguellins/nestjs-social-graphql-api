import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { OutboxEventStatus } from "@prisma/client";

import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";
import { HomeFeedOutboxHandler } from "@/posts/home-feed-outbox.handler";
import { OutboxPermanentError } from "@/outbox/outbox.errors";
import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxService } from "@/outbox/outbox.service";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

describe("OutboxProcessorService", () => {
  const outboxServiceMock = {
    claimPendingBatch: jest.fn(),
    bumpAttemptCount: jest.fn(),
    markFailed: jest.fn(),
    markProcessed: jest.fn(),
    rescheduleRetry: jest.fn(),
  };
  const notificationOutboxHandlerMock = {
    handleCommentReplyDelivery: jest.fn(),
    handleFollowRequestDelivery: jest.fn(),
  };
  const homeFeedOutboxHandlerMock = {
    handle: jest.fn(),
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
        case "FEED_PROJECTION_WORKER_ENABLED":
          return true;
        default:
          return undefined;
      }
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    outboxServiceMock.claimPendingBatch.mockResolvedValue([]);
    outboxServiceMock.bumpAttemptCount.mockResolvedValue(1);
  });

  it("marks events processed after successful handler execution", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: NotificationOutboxHandler,
          useValue: notificationOutboxHandlerMock,
        },
        {
          provide: HomeFeedOutboxHandler,
          useValue: homeFeedOutboxHandlerMock,
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
    expect(
      notificationOutboxHandlerMock.handleCommentReplyDelivery,
    ).toHaveBeenCalledTimes(1);
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
          provide: NotificationOutboxHandler,
          useValue: notificationOutboxHandlerMock,
        },
        {
          provide: HomeFeedOutboxHandler,
          useValue: homeFeedOutboxHandlerMock,
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
    notificationOutboxHandlerMock.handleCommentReplyDelivery.mockRejectedValue(
      new OutboxPermanentError("missing"),
    );

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
          provide: NotificationOutboxHandler,
          useValue: notificationOutboxHandlerMock,
        },
        {
          provide: HomeFeedOutboxHandler,
          useValue: homeFeedOutboxHandlerMock,
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
    notificationOutboxHandlerMock.handleCommentReplyDelivery.mockRejectedValue(
      new Error("redis down"),
    );

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

  it("dispatches follow-request delivery events to the notification handler", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: NotificationOutboxHandler,
          useValue: notificationOutboxHandlerMock,
        },
        {
          provide: HomeFeedOutboxHandler,
          useValue: homeFeedOutboxHandlerMock,
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

    expect(
      notificationOutboxHandlerMock.handleFollowRequestDelivery,
    ).toHaveBeenCalledTimes(1);
    expect(outboxServiceMock.markProcessed).toHaveBeenCalledWith(7);
  });

  it("dispatches home-feed events to the feed outbox handler", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: NotificationOutboxHandler,
          useValue: notificationOutboxHandlerMock,
        },
        {
          provide: HomeFeedOutboxHandler,
          useValue: homeFeedOutboxHandlerMock,
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

    expect(homeFeedOutboxHandlerMock.handle).toHaveBeenCalledTimes(1);
    expect(outboxServiceMock.markProcessed).toHaveBeenCalledWith(9);
  });

  it("marks exhausted retry failures and records the exhausted outcome", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: NotificationOutboxHandler,
          useValue: notificationOutboxHandlerMock,
        },
        {
          provide: HomeFeedOutboxHandler,
          useValue: homeFeedOutboxHandlerMock,
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
    notificationOutboxHandlerMock.handleCommentReplyDelivery.mockRejectedValue(
      new Error("redis down"),
    );

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
    const feedDisabledConfigServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_BATCH_SIZE":
            return 20;
          case "OUTBOX_MAX_ATTEMPTS":
            return 3;
          case "FEED_PROJECTION_WORKER_ENABLED":
            return false;
          default:
            return undefined;
        }
      }),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxProcessorService,
        { provide: OutboxService, useValue: outboxServiceMock },
        {
          provide: NotificationOutboxHandler,
          useValue: notificationOutboxHandlerMock,
        },
        {
          provide: HomeFeedOutboxHandler,
          useValue: homeFeedOutboxHandlerMock,
        },
        { provide: MetricsRegistryService, useValue: metricsRegistryMock },
        { provide: ConfigService, useValue: feedDisabledConfigServiceMock },
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

    expect(homeFeedOutboxHandlerMock.handle).not.toHaveBeenCalled();
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
});

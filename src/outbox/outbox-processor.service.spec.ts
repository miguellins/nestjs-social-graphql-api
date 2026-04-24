import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { OutboxEventStatus } from "@prisma/client";

import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";
import { OutboxPermanentError } from "@/outbox/outbox.errors";
import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxService } from "@/outbox/outbox.service";

describe("OutboxProcessorService", () => {
  const outboxServiceMock = {
    claimPendingBatch: jest.fn(),
    markFailed: jest.fn(),
    markProcessed: jest.fn(),
    rescheduleRetry: jest.fn(),
  };
  const notificationOutboxHandlerMock = {
    handleCommentReplyDelivery: jest.fn(),
    handleFollowRequestDelivery: jest.fn(),
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
});

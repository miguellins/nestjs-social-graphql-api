import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { OutboxEventStatus } from "@prisma/client";

import { PrismaService } from "@/prisma/prisma.service";
import { OutboxService } from "@/outbox/outbox.service";

describe("OutboxService", () => {
  const prismaMock = {
    outboxEvent: {
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      switch (key) {
        case "OUTBOX_ENABLED":
          return true;
        case "OUTBOX_COMMENT_REPLIED_ENABLED":
          return false;
        case "OUTBOX_FOLLOW_REQUESTED_ENABLED":
          return false;
        case "OUTBOX_PROCESSED_RETENTION_HOURS":
          return 24;
        case "OUTBOX_FAILED_RETENTION_HOURS":
          return 168;
        default:
          return undefined;
      }
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.outboxEvent.count.mockResolvedValue(0);
    prismaMock.outboxEvent.findFirst.mockResolvedValue(null);
  });

  it("enqueues one outbox event row", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxService);

    await service.enqueue({
      eventType: "notification.commentReply.deliver",
      aggregateType: "notification",
      aggregateId: 42,
      payload: {
        notificationId: 42,
      },
    });

    const createCalls = prismaMock.outboxEvent.create.mock.calls as Array<
      [
        {
          data: {
            eventType: string;
            aggregateType: string;
            aggregateId: number;
            payload: { notificationId: number };
            availableAt: Date;
          };
        },
      ]
    >;
    const [createArgs] = createCalls[0] ?? [];

    expect(createArgs?.data.eventType).toBe(
      "notification.commentReply.deliver",
    );
    expect(createArgs?.data.aggregateType).toBe("notification");
    expect(createArgs?.data.aggregateId).toBe(42);
    expect(createArgs?.data.payload).toEqual({
      notificationId: 42,
    });
    expect(createArgs?.data.availableAt).toBeInstanceOf(Date);
  });

  it("claims pending rows one by one using guarded status updates", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxService);

    prismaMock.outboxEvent.findMany.mockResolvedValue([
      {
        id: 1,
        status: OutboxEventStatus.PENDING,
        availableAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        id: 2,
        status: OutboxEventStatus.PENDING,
        availableAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    ]);
    prismaMock.outboxEvent.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    prismaMock.outboxEvent.findUnique.mockResolvedValue({
      id: 1,
      eventType: "notification.commentReply.deliver",
      aggregateType: "notification",
      aggregateId: 42,
      payload: { notificationId: 42 },
      status: OutboxEventStatus.PROCESSING,
      availableAt: new Date("2026-04-01T00:00:00.000Z"),
      attemptCount: 0,
      processedAt: null,
      lastError: null,
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    });

    const rows = await service.claimPendingBatch(2);

    expect(rows).toHaveLength(1);
    const updateCalls = prismaMock.outboxEvent.updateMany.mock.calls as Array<
      [
        {
          where: {
            id: number;
            status: OutboxEventStatus;
            availableAt: { lte: Date };
          };
          data: {
            status: OutboxEventStatus;
          };
        },
      ]
    >;
    const [firstUpdate] = updateCalls[0] ?? [];

    expect(firstUpdate?.where.id).toBe(1);
    expect(firstUpdate?.where.status).toBe(OutboxEventStatus.PENDING);
    expect(firstUpdate?.where.availableAt.lte).toBeInstanceOf(Date);
    expect(firstUpdate?.data).toEqual({
      status: OutboxEventStatus.PROCESSING,
    });
  });

  it("reports outbox summary for readiness checks", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxService);

    prismaMock.outboxEvent.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2);
    prismaMock.outboxEvent.findFirst.mockResolvedValue({
      availableAt: new Date(Date.now() - 5000),
    });

    const summary = await service.getSummary();

    expect(summary.enabled).toBe(true);
    expect(summary.pendingCount).toBe(4);
    expect(summary.failedCount).toBe(2);
    expect(summary.oldestPendingAgeMs).toEqual(expect.any(Number));
  });

  it("reports outbox as enabled for readiness when durable comment replies are enabled without the worker", async () => {
    const replyOnlyConfigServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return false;
          case "OUTBOX_COMMENT_REPLIED_ENABLED":
            return true;
          case "OUTBOX_FOLLOW_REQUESTED_ENABLED":
            return false;
          case "OUTBOX_PROCESSED_RETENTION_HOURS":
            return 24;
          case "OUTBOX_FAILED_RETENTION_HOURS":
            return 168;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: replyOnlyConfigServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxService);

    const summary = await service.getSummary();

    expect(summary).toEqual({
      enabled: true,
      pendingCount: 0,
      failedCount: 0,
      oldestPendingAgeMs: null,
    });
  });

  it("reports outbox as enabled for readiness when durable follow-request delivery is enabled without the worker", async () => {
    const followRequestConfigServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return false;
          case "OUTBOX_COMMENT_REPLIED_ENABLED":
            return false;
          case "OUTBOX_FOLLOW_REQUESTED_ENABLED":
            return true;
          case "OUTBOX_PROCESSED_RETENTION_HOURS":
            return 24;
          case "OUTBOX_FAILED_RETENTION_HOURS":
            return 168;
          default:
            return undefined;
        }
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: followRequestConfigServiceMock },
      ],
    }).compile();
    const service = moduleRef.get(OutboxService);

    const summary = await service.getSummary();

    expect(summary).toEqual({
      enabled: true,
      pendingCount: 0,
      failedCount: 0,
      oldestPendingAgeMs: null,
    });
  });
});

import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxService } from "@/outbox/outbox.service";
import { OutboxWorkerService } from "@/outbox/outbox-worker.service";

describe("OutboxWorkerService", () => {
  const outboxProcessorMock = {
    processNextBatch: jest.fn(),
  };
  const outboxServiceMock = {
    purgeExpiredEvents: jest.fn(),
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    outboxProcessorMock.processNextBatch.mockResolvedValue(0);
    outboxServiceMock.purgeExpiredEvents.mockResolvedValue(undefined);
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
      ],
    }).compile();

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(outboxProcessorMock.processNextBatch).not.toHaveBeenCalled();
    expect(outboxServiceMock.purgeExpiredEvents).not.toHaveBeenCalled();
  });

  it("processes one batch and purges expired rows when enabled", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
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
      ],
    }).compile();

    outboxProcessorMock.processNextBatch.mockResolvedValue(1);

    moduleRef.get(OutboxWorkerService).onModuleInit();
    await jest.runOnlyPendingTimersAsync();

    expect(outboxProcessorMock.processNextBatch).toHaveBeenCalledTimes(1);
    expect(outboxServiceMock.purgeExpiredEvents).toHaveBeenCalledTimes(1);
  });

  it("stops scheduling new ticks after shutdown", async () => {
    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "OUTBOX_ENABLED":
            return true;
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
      ],
    }).compile();

    const service = moduleRef.get(OutboxWorkerService);

    service.onModuleInit();
    service.onModuleDestroy();
    await jest.runOnlyPendingTimersAsync();

    expect(outboxProcessorMock.processNextBatch).not.toHaveBeenCalled();
    expect(outboxServiceMock.purgeExpiredEvents).not.toHaveBeenCalled();
  });
});

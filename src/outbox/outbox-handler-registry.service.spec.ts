import { Test } from "@nestjs/testing";

import { OUTBOX_EVENT_HANDLERS } from "@/outbox/outbox-handler.types";
import type { OutboxDurableEventHandler } from "@/outbox/outbox-handler.types";
import { OutboxHandlerRegistryService } from "@/outbox/outbox-handler-registry.service";

describe("OutboxHandlerRegistryService", () => {
  const firstHandler: OutboxDurableEventHandler = {
    eventTypes: ["event.one", "event.two"],
    handle: jest.fn(),
  };
  const secondHandler: OutboxDurableEventHandler = {
    eventTypes: ["event.three"],
    handle: jest.fn(),
  };

  it("builds a lookup map from registered durable handlers", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxHandlerRegistryService,
        {
          provide: OUTBOX_EVENT_HANDLERS,
          useValue: [firstHandler, secondHandler],
        },
      ],
    }).compile();

    const registry = moduleRef.get(OutboxHandlerRegistryService);

    expect(registry.getHandlerOrUndefined("event.one")).toBe(firstHandler);
    expect(registry.getHandlerOrUndefined("event.two")).toBe(firstHandler);
    expect(registry.getHandlerOrUndefined("event.three")).toBe(secondHandler);
  });

  it("returns undefined for unknown event types", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OutboxHandlerRegistryService,
        {
          provide: OUTBOX_EVENT_HANDLERS,
          useValue: [firstHandler],
        },
      ],
    }).compile();

    const registry = moduleRef.get(OutboxHandlerRegistryService);

    expect(registry.getHandlerOrUndefined("event.missing")).toBeUndefined();
  });

  it("fails fast when two handlers register the same event type", async () => {
    const duplicateHandler: OutboxDurableEventHandler = {
      eventTypes: ["event.one"],
      handle: jest.fn(),
    };

    await expect(
      Test.createTestingModule({
        providers: [
          OutboxHandlerRegistryService,
          {
            provide: OUTBOX_EVENT_HANDLERS,
            useValue: [firstHandler, duplicateHandler],
          },
        ],
      }).compile(),
    ).rejects.toThrow(
      "Duplicate durable outbox handler registered for event type event.one",
    );
  });
});

import { Inject, Injectable } from "@nestjs/common";

import {
  OUTBOX_EVENT_HANDLERS,
  type OutboxDurableEventHandler,
} from "@/outbox/outbox-handler.types";

/** Resolves durable outbox event types to their feature-owned handlers. */
@Injectable()
export class OutboxHandlerRegistryService {
  private readonly handlersByEventType = new Map<
    string,
    OutboxDurableEventHandler
  >();

  constructor(
    @Inject(OUTBOX_EVENT_HANDLERS)
    handlers: readonly OutboxDurableEventHandler[],
  ) {
    for (const handler of handlers) {
      for (const eventType of handler.eventTypes) {
        const existingHandler = this.handlersByEventType.get(eventType);
        if (existingHandler) {
          throw new Error(
            `Duplicate durable outbox handler registered for event type ${eventType}: ${existingHandler.constructor.name} and ${handler.constructor.name}`,
          );
        }

        this.handlersByEventType.set(eventType, handler);
      }
    }
  }

  /** Returns the registered handler for an event type, if one exists. */
  getHandlerOrUndefined(
    eventType: string,
  ): OutboxDurableEventHandler | undefined {
    return this.handlersByEventType.get(eventType);
  }
}

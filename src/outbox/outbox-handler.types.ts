import type { OutboxEvent } from "@prisma/client";

export const OUTBOX_EVENT_HANDLERS = Symbol("OUTBOX_EVENT_HANDLERS");

export type OutboxPreDispatchOutcome = "continue" | "retry_scheduled";

export type OutboxDispatchOutcome = "processed" | "retry_scheduled";

/** Handles one or more durable outbox event types contributed by a feature. */
export interface OutboxDurableEventHandler {
  readonly eventTypes: readonly string[];
  handle(event: OutboxEvent): Promise<void>;
  preDispatch?(event: OutboxEvent): Promise<OutboxPreDispatchOutcome>;
}

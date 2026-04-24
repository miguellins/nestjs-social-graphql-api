/** Signals an outbox failure that should not be retried by the worker. */
export class OutboxPermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OutboxPermanentError";
  }
}

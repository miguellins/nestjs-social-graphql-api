import type { LoggerService } from "@nestjs/common";

/** Runs an async operation, logs any errors at the specified level, but does not rethrow. */
type BestEffortLogLevel = "warn" | "error";

/** Logger interface restricted to `warn` and `error` methods for best-effort operations. */
type BestEffortLogger = Pick<LoggerService, BestEffortLogLevel>;

/** Runs an async operation, logging any errors at the provided log level without throwing. */
export async function runBestEffort(
  logger: BestEffortLogger,
  level: BestEffortLogLevel,
  message: string,
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const stack = error instanceof Error ? error.stack : undefined;

    if (level === "warn") {
      logger.warn(message, stack);
      return;
    }

    logger.error(message, stack);
  }
}

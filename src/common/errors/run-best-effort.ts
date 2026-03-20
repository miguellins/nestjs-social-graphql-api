import type { LoggerService } from "@nestjs/common";

type BestEffortLogLevel = "warn" | "error";

type BestEffortLogger = Pick<LoggerService, BestEffortLogLevel>;

/**
 * Runs non-critical follow-up work and logs failures without surfacing them
 *
 * Use this only for post-success side effects such as cache refresh or event delivery
 */

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

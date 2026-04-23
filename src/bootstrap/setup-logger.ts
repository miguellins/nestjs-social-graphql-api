import { Logger, type INestApplication } from "@nestjs/common";

import { AppLoggerService } from "@/common/logging/app-logger.service";

/** Installs the shared structured logger so Nest and Logger() calls use the same sink. */
export function setupLogger(app: INestApplication): void {
  const logger = app.get(AppLoggerService);

  app.useLogger(logger);
  Logger.overrideLogger(logger);
}

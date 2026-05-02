import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";

import { AppLoggerService } from "@/common/logging/app-logger.service";

import { AppModule } from "@/app.module";

process.env.OUTBOX_PROCESS_ROLE = "worker";

/** Bootstraps a dedicated application context that only runs background workers. */
async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(AppLoggerService);

  app.useLogger(logger);
  Logger.overrideLogger(logger);
}

bootstrapWorker().catch((error) => {
  console.error("Error during outbox worker bootstrap:", error);
  process.exit(1);
});

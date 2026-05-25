import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";

import { AppLoggerService } from "@/common/logging/app-logger.service";

import { initTracing, shutdownTracing } from "@/tracing/tracing.bootstrap";

import { AppModule } from "@/app.module";

process.env.OTEL_SERVICE_NAME ||= "nestjs-social-graphql-api-worker";
process.env.METRICS_PROCESS_LABEL = "worker";
process.env.OUTBOX_PROCESS_ROLE = "worker";

/** Bootstraps a dedicated application context that only runs background workers. */
async function bootstrapWorker() {
  initTracing();

  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(AppLoggerService);

  app.useLogger(logger);
  Logger.overrideLogger(logger);

  const shutdown = async () => {
    await shutdownTracing();
  };

  process.once("SIGTERM", () => void shutdown());
  process.once("SIGINT", () => void shutdown());
}

bootstrapWorker().catch((error) => {
  console.error("Error during outbox worker bootstrap:", error);
  process.exit(1);
});

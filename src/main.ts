import { NestFactory } from "@nestjs/core";

import { setupValidation } from "@/bootstrap/setup-validation";
import { setupSecurity } from "@/bootstrap/setup-security";
import { setupFilters } from "@/bootstrap/setup-filters";
import { setupLogger } from "@/bootstrap/setup-logger";

import { RequestContextMiddleware } from "@/common/request-context/request-context.middleware";

import { HealthService } from "@/ops/health.service";

import { AppModule } from "@/app.module";

/** Bootstraps the NestJS app with validation, filters, security, and shutdown hooks. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const requestContextMiddleware = app.get(RequestContextMiddleware);

  /** Registers the structured logger for bootstrap and runtime logs. */
  setupLogger(app);

  /** Initializes request correlation before controller and GraphQL execution begins. */
  app.use(requestContextMiddleware.use.bind(requestContextMiddleware));

  /** Enables global request validation. */
  setupValidation(app);

  /** Enables global exception filter. */
  setupFilters(app);

  /** Adds common protection HTTP headers. */
  setupSecurity(app);

  /** Enables graceful shutdown. */
  app.enableShutdownHooks();

  /** Marks the application as boot-complete for liveness probes. */
  app.get(HealthService).markBootCompleted();

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err) => {
  console.error("Error during bootstrap:", err);
  process.exit(1);
});

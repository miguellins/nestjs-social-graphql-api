import { NestFactory } from "@nestjs/core";

import { setupValidation } from "@/bootstrap/setup-validation";
import { setupSecurity } from "@/bootstrap/setup-security";
import { setupFilters } from "@/bootstrap/setup-filters";

import { AppModule } from "@/app.module";

/** Bootstraps the NestJS app with validation, filters, security, and shutdown hooks. */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  /** Enables global request validation. */
  setupValidation(app);

  /** Enables global exception filter. */
  setupFilters(app);

  /** Adds common protection HTTP headers. */
  setupSecurity(app);

  /** Enables graceful shutdown. */
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((err) => {
  console.error("Error during bootstrap:", err);
  process.exit(1);
});

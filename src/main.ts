import { NestFactory } from "@nestjs/core";

import { setupValidation } from "@/bootstrap/setup-validation";
import { setupSecurity } from "@/bootstrap/setup-security";
import { setupFilters } from "@/bootstrap/setup-filters";

import { AppModule } from "@/app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enables global request validation + automatic input cleaning
  setupValidation(app);

  // Enables global exception filter for GraphQL errors
  setupFilters(app);

  // Adds several HTTP headers that helps protect the app from common vulnerabilities
  setupSecurity(app);

  // Allows SIGINT/SIGTERM to trigger module destroy lifecycle
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap().catch((err) => {
  console.error("Error during bootstrap:", err);
  process.exit(1);
});

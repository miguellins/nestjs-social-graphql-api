import { type INestApplication, ValidationPipe } from "@nestjs/common";

/**
 * Bootstrap helper for request validation
 *
 * Registers the global validation pipe
 */

export function setupValidation(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      // Strips unknown properties
      whitelist: true,

      // Throws error on extra fields
      forbidNonWhitelisted: true,

      // Auto-transform payloads to DTO classes
      transform: true,
    }),
  );
}

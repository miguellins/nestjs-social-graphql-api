import { type INestApplication, ValidationPipe } from "@nestjs/common";

/** Registers a global ValidationPipe with whitelist, forbidNonWhitelisted, and transform enabled. */
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

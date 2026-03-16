import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";

/**
 * Configures the global validation pipe used by GraphQL and HTTP requests
 *
 * This centralizes whitelist enforcement, rejection of unknown fields, and
 * automatic payload transformation into DTO and args classes
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

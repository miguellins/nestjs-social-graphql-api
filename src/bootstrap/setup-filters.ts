import type { INestApplication } from "@nestjs/common";

import { GlobalGqlExceptionFilter } from "@/common/filters/gql-exception.filter";

/**
 * Registers the global GraphQL exception filter used across the application
 *
 * This keeps Prisma errors and Nest HTTP exceptions normalized before they
 * are returned to GraphQL clients
 */

export function setupFilters(app: INestApplication): void {
  app.useGlobalFilters(new GlobalGqlExceptionFilter());
}

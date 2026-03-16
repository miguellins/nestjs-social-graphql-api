import type { INestApplication } from "@nestjs/common";

import { GlobalGqlExceptionFilter } from "@/common/filters/gql-exception.filter";

/**
 * Bootstrap helper for global filters
 *
 * Registers the GraphQL exception filter
 */

export function setupFilters(app: INestApplication): void {
  app.useGlobalFilters(new GlobalGqlExceptionFilter());
}

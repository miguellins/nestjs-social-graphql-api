import type { INestApplication } from "@nestjs/common";

import { GlobalGqlExceptionFilter } from "@/common/filters/gql-exception.filter";

/** Registers the global GraphQL exception filter for the NestJS app. */
export function setupFilters(app: INestApplication): void {
  app.useGlobalFilters(new GlobalGqlExceptionFilter());
}

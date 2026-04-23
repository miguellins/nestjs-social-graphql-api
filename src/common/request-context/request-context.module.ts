import { Global, Module } from "@nestjs/common";

import { RequestContextMiddleware } from "@/common/request-context/request-context.middleware";
import { RequestContextService } from "@/common/request-context/request-context.service";

/** Registers shared request context providers used by bootstrap, GraphQL, and logging. */
@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware],
  exports: [RequestContextService, RequestContextMiddleware],
})
export class RequestContextModule {}

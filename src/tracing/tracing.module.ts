import { Global, Module } from "@nestjs/common";

import { TracingService } from "@/tracing/tracing.service";

/** Provides manual tracing helpers to feature services. */
@Global()
@Module({
  providers: [TracingService],
  exports: [TracingService],
})
export class TracingModule {}

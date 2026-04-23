import { Global, Module } from "@nestjs/common";

import { AppLoggerService } from "@/common/logging/app-logger.service";

/** Registers the shared structured logger used by bootstrap and runtime services. */
@Global()
@Module({
  providers: [AppLoggerService],
  exports: [AppLoggerService],
})
export class LoggingModule {}

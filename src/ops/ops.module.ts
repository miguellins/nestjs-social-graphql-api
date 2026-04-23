import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { HealthController } from "@/ops/health.controller";
import { HealthService } from "@/ops/health.service";

/** Groups operational HTTP endpoints and readiness helpers. */
@Module({
  imports: [CacheHelpersModule],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class OpsModule {}

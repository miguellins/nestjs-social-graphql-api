import { Global, Module } from "@nestjs/common";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";
import { MetricsServerService } from "@/metrics/metrics-server.service";

/** Provides private Prometheus metrics exposure for API and worker processes. */
@Global()
@Module({
  providers: [MetricsRegistryService, MetricsServerService],
  exports: [MetricsRegistryService],
})
export class MetricsModule {}

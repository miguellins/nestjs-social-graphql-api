import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { Public } from "@/common/decorators/auth.decorator";

import { HealthService } from "@/ops/health.service";

/** Exposes lightweight operational health endpoints outside the GraphQL surface. */
@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get("live")
  liveness() {
    return this.healthService.liveness();
  }

  @Get("ready")
  async readiness() {
    return this.healthService.readiness();
  }
}

import { performance } from "node:perf_hooks";

import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";

import { Prisma, PrismaClient } from "@prisma/client";

import {
  MetricsRegistryService,
  type PrismaQueryOutcome,
} from "@/metrics/metrics-registry.service";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleDestroy, OnModuleInit
{
  constructor(metricsRegistry: MetricsRegistryService) {
    super();

    const extendedClient = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const startedAt = performance.now();

            try {
              const result = await query(args);
              metricsRegistry.recordPrismaQuery(
                model,
                operation,
                "success",
                toDurationSeconds(startedAt),
              );
              return result;
            } catch (error) {
              metricsRegistry.recordPrismaQuery(
                model,
                operation,
                toPrismaQueryOutcome(error),
                toDurationSeconds(startedAt),
              );
              throw error;
            }
          },
        },
      },
    });

    Object.assign(this, extendedClient);
  }

  /** Opens the shared Prisma connection pool during Nest module startup. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Closes the shared Prisma connection pool during Nest module shutdown. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/** Converts a monotonic start timestamp into seconds for Prometheus histograms. */
function toDurationSeconds(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt) / 1_000;
}

/** Maps Prisma errors to low-cardinality Prometheus outcome buckets. */
function toPrismaQueryOutcome(error: unknown): PrismaQueryOutcome {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return "unique_violation";
    if (error.code === "P2003") return "foreign_key";
    if (error.code === "P2025") return "not_found";
  }

  return "error";
}

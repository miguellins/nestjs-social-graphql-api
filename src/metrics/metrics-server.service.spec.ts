import { get } from "node:http";
import type { AddressInfo } from "node:net";

import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";
import { MetricsServerService } from "@/metrics/metrics-server.service";

describe("MetricsServerService", () => {
  let moduleRef: TestingModule;

  afterEach(async () => {
    await moduleRef?.close();
  });

  it("does not start a metrics server by default", async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        MetricsRegistryService,
        MetricsServerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(undefined),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(MetricsServerService);

    await service.onModuleInit();

    expect(getServerAddress(service)).toBeNull();
  });

  it("serves registered metric names when enabled", async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        MetricsRegistryService,
        MetricsServerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, unknown> = {
                METRICS_ENABLED: true,
                METRICS_HOST: "127.0.0.1",
                METRICS_PORT: 0,
              };

              return values[key];
            }),
          },
        },
      ],
    }).compile();

    const service = moduleRef.get(MetricsServerService);
    const registry = moduleRef.get(MetricsRegistryService);

    await service.onModuleInit();
    registry.incrementOutboxWorkerTick();
    registry.recordOutboxEventProcessed(
      "notification.commentReply.deliver",
      "processed",
      0.05,
    );
    registry.recordGraphqlOperation("ViewerQuery", "query", "success", 0.03);
    registry.incrementCacheOperation("get_or_set", "hit");
    registry.recordPrismaQuery("User", "findMany", "success", 0.01);
    registry.incrementAuthFailure("unauthorized");
    registry.incrementThrottleRejection();

    const address = getServerAddress(service);
    expect(address).not.toBeNull();

    const response = await requestMetrics(address as AddressInfo);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("# HELP outbox_worker_ticks_total");
    expect(response.body).toContain("# HELP home_feed_shadow_compare_total");
    expect(response.body).toContain("# HELP metrics_db_refresh_errors_total");
    expect(response.body).toContain("# HELP graphql_operations_total");
    expect(response.body).toContain("# HELP cache_operations_total");
    expect(response.body).toContain("# HELP prisma_queries_total");
    expect(response.body).toContain("# HELP auth_failures_total");
    expect(response.body).toContain("# HELP throttle_rejections_total");
    expect(response.body).toContain(
      'outbox_worker_ticks_total{process="worker"} 1',
    );
    expect(response.body).toContain(
      'outbox_events_total{process="worker",event_type="notification.commentReply.deliver",outcome="processed"} 1',
    );
    expect(response.body).toContain(
      'graphql_operations_total{process="api",operation_name="ViewerQuery",operation_type="query",outcome="success"} 1',
    );
    expect(response.body).toContain(
      'cache_operations_total{process="api",operation="get_or_set",result="hit"} 1',
    );
    expect(response.body).toContain(
      'prisma_queries_total{process="api",model="User",action="findMany",outcome="success"} 1',
    );
    expect(response.body).toContain(
      'auth_failures_total{process="api",reason="unauthorized"} 1',
    );
    expect(response.body).toContain(
      'throttle_rejections_total{process="api"} 1',
    );
  });
});

function getServerAddress(
  service: MetricsServerService,
): AddressInfo | string | null {
  return (
    (
      service as unknown as {
        server: { address: () => AddressInfo | string | null } | null;
      }
    ).server?.address() ?? null
  );
}

function requestMetrics(address: AddressInfo): Promise<{
  body: string;
  statusCode: number | undefined;
}> {
  return new Promise((resolve, reject) => {
    const request = get(
      {
        hostname: address.address,
        port: address.port,
        path: "/metrics",
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve({
            body,
            statusCode: response.statusCode,
          });
        });
      },
    );

    request.on("error", reject);
  });
}

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

    const address = getServerAddress(service);
    expect(address).not.toBeNull();

    const response = await requestMetrics(address as AddressInfo);

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("# HELP outbox_worker_ticks_total");
    expect(response.body).toContain("# HELP home_feed_shadow_compare_total");
    expect(response.body).toContain("# HELP metrics_db_refresh_errors_total");
    expect(response.body).toContain(
      'outbox_worker_ticks_total{process="worker"} 1',
    );
    expect(response.body).toContain(
      'outbox_events_total{process="worker",event_type="notification.commentReply.deliver",outcome="processed"} 1',
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

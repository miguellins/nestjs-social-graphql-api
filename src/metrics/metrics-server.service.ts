import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

/** Exposes Prometheus metrics on a dedicated internal HTTP server. */
@Injectable()
export class MetricsServerService implements OnModuleDestroy, OnModuleInit {
  private readonly logger = new Logger(MetricsServerService.name);
  private readonly enabled: boolean;
  private readonly host: string;
  private readonly port: number;
  private server: Server | null = null;

  constructor(
    configService: ConfigService,
    private readonly metricsRegistry: MetricsRegistryService,
  ) {
    this.enabled = configService.get<boolean>("METRICS_ENABLED") ?? false;
    this.host = configService.get<string>("METRICS_HOST") ?? "127.0.0.1";
    this.port = configService.get<number>("METRICS_PORT") ?? 9090;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    if (this.server) return;

    await this.startServer();
  }

  async onModuleDestroy(): Promise<void> {
    await this.closeServer();
  }

  private async startServer(): Promise<void> {
    const server = createServer((request, response) => {
      void this.handleRequest(request, response);
    });

    await new Promise<void>((resolve, reject) => {
      const handleError = (error: Error) => {
        server.off("listening", handleListening);
        reject(error);
      };
      const handleListening = () => {
        server.off("error", handleError);
        resolve();
      };

      server.once("error", handleError);
      server.once("listening", handleListening);
      server.listen(this.port, this.host);
    });

    this.server = server;
    this.logger.log("Metrics server listening", {
      host: this.host,
      port: this.port,
    });
  }

  private async closeServer(): Promise<void> {
    if (!this.server) return;

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  private async handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== "GET" || getPathname(request.url) !== "/metrics") {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    try {
      const body = await this.metricsRegistry.metrics();
      response.writeHead(200, {
        "Content-Type": this.metricsRegistry.contentType,
      });
      response.end(body);
    } catch (error) {
      this.logger.error(
        "Failed to render metrics",
        error instanceof Error ? error.stack : undefined,
        MetricsServerService.name,
      );
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Failed to render metrics");
    }
  }
}

function getPathname(url: string | undefined): string {
  if (!url) return "/";

  return url.split("?", 1)[0] ?? "/";
}

import { ConsoleLogger } from "@nestjs/common";

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { NestInstrumentation } from "@opentelemetry/instrumentation-nestjs-core";
import { GraphQLInstrumentation } from "@opentelemetry/instrumentation-graphql";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PrismaInstrumentation } from "@prisma/instrumentation";
import {
  ParentBasedSampler,
  SimpleSpanProcessor,
  TraceIdRatioBasedSampler,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";

const DEFAULT_API_SERVICE_NAME = "nestjs-social-graphql-api";
const DEFAULT_WORKER_SERVICE_NAME = "nestjs-social-graphql-api-worker";
const DEFAULT_SAMPLER = "parentbased_traceidratio";
const SENSITIVE_QUERY_PARAMS = [
  "authorization",
  "cookie",
  "password",
  "resetToken",
  "token",
  "verificationToken",
];

let sdk: NodeSDK | null = null;

export type InitTracingOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: Pick<ConsoleLogger, "warn">;
  spanExporter?: SpanExporter;
};

/** Initializes OpenTelemetry tracing once when enabled and configured. */
export function initTracing(options: InitTracingOptions = {}): boolean {
  if (sdk) return true;

  const env = options.env ?? process.env;
  if (!isTracingEnabled(env)) return false;

  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint && !options.spanExporter) {
    const logger = options.logger ?? new ConsoleLogger("TracingBootstrap");
    logger.warn(
      "TRACING_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is unset; tracing disabled.",
    );
    return false;
  }

  applyTracingEnvDefaults(env);

  sdk = new NodeSDK({
    serviceName: getServiceName(env),
    traceExporter: options.spanExporter ?? new OTLPTraceExporter(),
    spanProcessors: options.spanExporter
      ? [new SimpleSpanProcessor(options.spanExporter)]
      : undefined,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(getSamplerRatio(env)),
    }),
    instrumentations: [
      new HttpInstrumentation({
        headersToSpanAttributes: {},
        redactedQueryParams: SENSITIVE_QUERY_PARAMS,
      }),
      new NestInstrumentation(),
      new GraphQLInstrumentation({
        allowValues: false,
        depth: 3,
        ignoreTrivialResolveSpans: true,
        mergeItems: true,
      }),
      new IORedisInstrumentation(),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();
  return true;
}

/** Flushes and shuts down OpenTelemetry tracing if it was initialized. */
export async function shutdownTracing(): Promise<void> {
  if (!sdk) return;

  const activeSdk = sdk;
  sdk = null;
  await activeSdk.shutdown();
}

/** Checks whether tracing is enabled by the validated environment. */
function isTracingEnabled(env: NodeJS.ProcessEnv): boolean {
  return env.TRACING_ENABLED?.trim().toLowerCase() === "true";
}

/** Applies standard OTEL env defaults used by the SDK and downstream tooling. */
function applyTracingEnvDefaults(env: NodeJS.ProcessEnv): void {
  env.OTEL_SERVICE_NAME ||= getServiceName(env);
  env.OTEL_TRACES_SAMPLER ||= DEFAULT_SAMPLER;
  env.OTEL_TRACES_SAMPLER_ARG ||= getDefaultSamplerRatio(env).toString();
}

/** Returns the configured OpenTelemetry service name for this process. */
function getServiceName(env: NodeJS.ProcessEnv): string {
  const configured = env.OTEL_SERVICE_NAME?.trim();
  if (configured) return configured;

  return env.METRICS_PROCESS_LABEL === "worker"
    ? DEFAULT_WORKER_SERVICE_NAME
    : DEFAULT_API_SERVICE_NAME;
}

/** Parses the root trace sampling ratio from env with production-safe defaults. */
function getSamplerRatio(env: NodeJS.ProcessEnv): number {
  const parsed = Number(env.OTEL_TRACES_SAMPLER_ARG);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) return parsed;

  return getDefaultSamplerRatio(env);
}

/** Returns the default sample ratio for the current runtime environment. */
function getDefaultSamplerRatio(env: NodeJS.ProcessEnv): number {
  return env.NODE_ENV === "production" ? 0.1 : 1.0;
}

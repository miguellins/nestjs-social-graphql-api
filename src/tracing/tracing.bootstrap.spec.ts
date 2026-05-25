import { trace } from "@opentelemetry/api";
import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-base";

import { initTracing, shutdownTracing } from "@/tracing/tracing.bootstrap";

describe("tracing bootstrap", () => {
  afterEach(async () => {
    await shutdownTracing();
  });

  it("is disabled when TRACING_ENABLED is false", () => {
    const enabled = initTracing({
      env: { TRACING_ENABLED: "false" } as NodeJS.ProcessEnv,
    });

    expect(enabled).toBe(false);
  });

  it("warns and disables tracing when enabled without an OTLP endpoint", () => {
    const logger = { warn: jest.fn() };

    const enabled = initTracing({
      env: { TRACING_ENABLED: "true" } as NodeJS.ProcessEnv,
      logger,
    });

    expect(enabled).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "TRACING_ENABLED=true but OTEL_EXPORTER_OTLP_ENDPOINT is unset; tracing disabled.",
    );
  });

  it("exports spans to an in-memory exporter when enabled", async () => {
    const exporter = new InMemorySpanExporter();
    const env = {
      NODE_ENV: "development",
      TRACING_ENABLED: "true",
      OTEL_SERVICE_NAME: "test-service",
    } as NodeJS.ProcessEnv;

    const enabled = initTracing({ env, spanExporter: exporter });

    expect(enabled).toBe(true);

    const span = trace
      .getTracer("tracing-bootstrap-test")
      .startSpan("test.span");
    expect(span.isRecording()).toBe(true);
    expect(span.spanContext().traceFlags).toBe(1);
    span.end();
    await new Promise((resolve) => setImmediate(resolve));
    expect(exporter.getFinishedSpans().map((span) => span.name)).toContain(
      "test.span",
    );
  });
});

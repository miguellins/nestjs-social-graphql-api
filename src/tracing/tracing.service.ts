import { Injectable } from "@nestjs/common";

import {
  context,
  trace,
  TraceFlags,
  type Attributes,
} from "@opentelemetry/api";

/** Provides feature-safe helpers for manual OpenTelemetry spans. */
@Injectable()
export class TracingService {
  private readonly tracer = trace.getTracer("nestjs-social-graphql-api");

  /** Runs the callback inside an active manual span when tracing is available. */
  async startActiveSpan<T>(
    name: string,
    attributes: Attributes,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, { attributes }, async (span) => {
      try {
        return await callback();
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /** Returns true when the current active trace is sampled. */
  isCurrentTraceSampled(): boolean {
    const span = trace.getSpan(context.active());
    if (!span) return false;

    return Boolean(span.spanContext().traceFlags & TraceFlags.SAMPLED);
  }
}

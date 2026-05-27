# Tracing Module

The tracing module provides feature-safe helpers for manual OpenTelemetry spans.

## What this module covers

- manual active span creation
- exception recording on manual spans
- sampled-trace detection
- global tracing helper export

## Runtime Surface

This module does not expose GraphQL operations or HTTP routes.

It supports code paths that need explicit manual spans beyond automatic instrumentation.

## Important behavior

- tracing is controlled by the repository OpenTelemetry bootstrap and environment settings
- manual spans should use low-cardinality attributes
- do not attach secrets, tokens, raw query bodies, user-provided long text, or high-cardinality identifiers as span attributes
- errors are recorded on spans and then re-thrown

## Configuration

- `TRACING_ENABLED`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS`
- `OTEL_TRACES_SAMPLER`
- `OTEL_TRACES_SAMPLER_ARG`
- `OTEL_RESOURCE_ATTRIBUTES`

## Service ownership

- `TracingService` owns manual span execution and sampled-trace checks.

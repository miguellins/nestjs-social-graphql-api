# Observability

This project exposes structured logs, request correlation, Prometheus metrics, and optional OpenTelemetry tracing. Observability is internal only: GraphQL response shapes do not include trace ids, and trace ids are not returned in HTTP headers.

## Runtime Signals

- `x-request-id` remains the support/debug correlation id accepted and emitted by the HTTP request context middleware.
- Structured logs include `requestId`, GraphQL `operationName`, `userId` when known, and `traceId` / `spanId` when an OpenTelemetry span is active.
- Prometheus metrics are served on a dedicated internal HTTP server when `METRICS_ENABLED=true`.
- OpenTelemetry traces are exported over OTLP HTTP only when `TRACING_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Metrics Env

```env
METRICS_ENABLED=false
METRICS_HOST=127.0.0.1
METRICS_PORT=9090
METRICS_DB_REFRESH_INTERVAL_MS=15000
```

Scrape each process independently:

```text
http://METRICS_HOST:METRICS_PORT/metrics
```

When the API and outbox worker are colocated, give them different metrics ports, such as `9090` for the API and `9091` for the worker. Keep the bind address private, loopback-only, or cluster-internal.

## Tracing Env

```env
TRACING_ENABLED=false
OTEL_SERVICE_NAME=nestjs-social-graphql-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=development
```

Production should use `OTEL_TRACES_SAMPLER=parentbased_traceidratio` with `OTEL_TRACES_SAMPLER_ARG=0.1` unless traffic volume and collector capacity justify a different value. Development defaults to full sampling when tracing is enabled.

If `TRACING_ENABLED=true` but `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, startup logs a warning and tracing stays disabled. The app does not silently default to localhost and does not fail startup for a missing collector.

The worker entrypoint sets its service name to `nestjs-social-graphql-api-worker` unless explicitly configured otherwise.

## Metrics Catalog

Existing outbox/feed metric names and labels are preserved. New application metrics are additive.

GraphQL:

```text
graphql_operations_total{process,operation_name,operation_type,outcome}
graphql_operation_duration_seconds{process,operation_name,operation_type}
graphql_operation_errors_total{process,operation_name,error_code}
```

Cache:

```text
cache_operations_total{process,operation,result}
```

Prisma:

```text
prisma_queries_total{process,model,action,outcome}
prisma_query_duration_seconds{process,model,action}
```

Guards:

```text
auth_failures_total{process,reason}
throttle_rejections_total{process}
```

Outbox/feed projection metrics remain available for worker ticks, event outcomes, event processing latency, batch size, backlog gauges, purge health, shadow compare counts, cleanup enqueue outcomes, projection fallback/read-source/reconciliation, and notification suppression.

## Label Rules

Use only bounded labels such as `process`, `operation_name`, `operation_type`, `outcome`, `error_code`, `operation`, `result`, `model`, `action`, `reason`, and `event_type`.

Do not add user ids, entity ids, raw GraphQL variables, cache keys, SQL, Prisma P-codes, tokens, emails, or raw exception messages to metric labels or span attributes.

## Alerts and Dashboards

Application alert rules live in:

```text
monitoring/prometheus/application-observability-alerts.yml
```

The application dashboard lives in:

```text
monitoring/grafana/application-observability-dashboard.json
```

The GraphQL p95 latency and sustained GraphQL error thresholds are conservative placeholders. Tune them after roughly one week of baseline traffic. The cache miss alert is global for `operation="get_or_set"` and calculates `miss / (hit + miss)` only.

## OTLP Collector Notes

Use an OTLP HTTP collector endpoint such as:

```text
http://collector:4318/v1/traces
```

Collector backends can be Tempo, Jaeger through an OpenTelemetry collector, Honeycomb, or any OTLP HTTP-compatible provider. Set `OTEL_EXPORTER_OTLP_HEADERS` only for collector auth, and do not commit production header values.

# Observability Trace and Log Correlation Runbook

Use this when a request has a support-visible `x-request-id` and you need to find related logs and traces.

## Steps

1. Search structured logs for the request id.

```text
requestId=<x-request-id>
```

2. Find the first log entry that includes `traceId` and `spanId`.

```text
traceId=<trace-id>
spanId=<span-id>
```

3. Open the trace backend and search by `traceId`.

```text
<trace-id>
```

4. Compare the root HTTP/Nest/GraphQL span with child spans for Prisma, Redis, cache `get_or_set`, and outbox work when present.

5. If no `traceId` appears, check whether tracing was enabled and configured.

```text
TRACING_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=<collector-http-traces-endpoint>
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=<0.0-to-1.0>
```

6. If metrics show impact but traces are missing, use the Prometheus labels first.

```text
graphql_operations_total
cache_operations_total
prisma_queries_total
auth_failures_total
throttle_rejections_total
```

## Notes

Do not send trace ids to API clients. The supported client-facing correlation handle remains `x-request-id`.

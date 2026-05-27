# Metrics Module

The metrics module owns Prometheus-compatible metric definitions and the private metrics HTTP server for API and worker processes.

## What this module covers

- shared Prometheus registry
- GraphQL operation metrics
- cache operation metrics
- Prisma query metrics
- auth and throttle metrics
- outbox worker metrics
- home-feed projection metrics
- notification suppression metrics
- private `GET /metrics` exposure when enabled

## Runtime Surface

This module does not expose GraphQL operations.

When `METRICS_ENABLED=true`, it exposes:

```text
GET http://METRICS_HOST:METRICS_PORT/metrics
```

The metrics server is separate from the Nest HTTP route tree and is intended for internal scraping only.

## Important behavior

- metrics are disabled by default
- API and worker processes should use different metrics ports when colocated
- metric labels must stay low-cardinality
- do not add user ids, event ids, aggregate ids, raw errors, or secrets as labels
- rendering failures return a sanitized 500 from the metrics server

## Configuration

- `METRICS_ENABLED`
- `METRICS_HOST`
- `METRICS_PORT`
- `METRICS_DB_REFRESH_INTERVAL_MS`
- `METRICS_PROCESS_LABEL`

## Service ownership

- `MetricsRegistryService` owns metric definitions and recording helpers.
- `MetricsServerService` owns the private HTTP server lifecycle and `/metrics` response rendering.

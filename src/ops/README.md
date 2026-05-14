# Ops Module

The ops module exposes lightweight operational HTTP endpoints outside the GraphQL surface.

## What this module covers

- liveness checks through `GET /health/live`
- readiness checks through `GET /health/ready`
- boot-complete tracking
- dependency-aware status for database, cache, and pubsub
- outbox readiness summary

## Important behavior

- both endpoints are public
- both endpoints skip throttling
- readiness includes dependency checks plus summary metadata
- readiness now includes outbox backlog visibility through `summary.outbox`

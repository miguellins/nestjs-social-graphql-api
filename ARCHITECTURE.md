# Architecture Direction

This document locks the current architecture direction for the project so future changes stay pragmatic and consistent.

## Current Decision

The backend remains a modular monolith.

It uses a layered, service-first structure:
- GraphQL resolvers are entrypoints
- feature services coordinate domain behavior
- Prisma is used directly inside feature services or feature-private collaborators
- DTO/select/model files define safe API and data-shaping boundaries
- shared infrastructure lives under `src/common/`, `src/graphql/`, `src/cache/`, `src/config/`, and `src/prisma/`

## What We Are Not Doing Right Now

The project is not moving to:
- microservices or distributed-service extraction
- a generic repository layer across the whole application
- a strict Clean Architecture or Hexagonal Architecture rewrite
- framework-heavy CQRS adoption

These options add more complexity than value for the current project size and maturity.

## Architectural Direction Going Forward

Keep the current architecture and sharpen internal boundaries where complexity is growing.

Preferred direction:
- keep feature modules as the main top-level structure
- keep resolvers thin
- keep core domain behavior in services
- keep Prisma access explicit
- extract feature-private helpers only when a service is becoming too broad

Preferred feature-private helper patterns:
- `*ReadService`
- `*CacheService`
- `*ProjectionService`
- `*TriggerService`

These helpers should stay inside the same feature module unless the logic is truly shared infrastructure.

## Decision Rules

When adding or changing architecture, prefer:
- small internal boundary improvements over large rewrites
- feature-local helpers over cross-project abstractions
- explicit DTO/select shaping over broad model reuse
- post-commit side-effect helpers for best-effort follow-up work

Avoid:
- generic abstractions introduced before real duplication exists
- cross-module service coupling that weakens feature boundaries
- growing a single feature service into a catch-all coordinator for every concern

## Async Follow-Up Pattern

For mutations and write-side workflows, separate work into two categories:

1. Core correctness
- validation
- authorization
- required persistence
- required transactions
- required counter consistency
- any step that must fail the request if it fails

2. Best-effort follow-up work
- cache invalidation or cache refresh
- subscription publish
- notification delivery
- analytics
- other post-commit delivery or acceleration work

Preferred pattern:
- commit the source-of-truth database write first
- return success based on the correctness-critical path
- run non-critical follow-up work behind a small feature-local helper or
  `runBestEffort(...)`
- log follow-up failures without turning a committed write into a false-negative
  mutation failure
- when retryability or cross-process delivery matters, persist a durable outbox
  event and let the worker process it after the source write commits

When async follow-up work grows in a feature, prefer feature-local helper names
such as:
- `*TriggerService`
- `*DeliveryService`
- `*ProjectionService`

Do not expand the outbox into a broad queue, broker, or distributed event
architecture until there is a real operational reason.

## Near-Term Focus

The next architectural improvements should be incremental:
1. Keep extracting feature-private helpers from broad services where cohesion is
   already under pressure.
2. Continue read/projection helpers only where they clearly improve module
   ownership.
3. Grow outbox-backed work selectively where retries are product-relevant.
4. Add metrics and tracing before expanding background processing much further.

## Long-Term Position

If the project grows, the expected direction is still a stronger modular monolith, not an immediate split into deployable services.

The main scaling goal is:
- stronger module-internal boundaries
- clearer read vs write separation in larger modules
- cleaner async side-effect boundaries

Extraction into separate services should happen only if there is a real operational reason, not as a default architecture move.

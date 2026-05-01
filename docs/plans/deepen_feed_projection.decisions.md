# Deepen feed projection — finalized decisions

This file captures the final implementation decisions for deepening the `homeFeed` projection architecture (projection-first reads, legacy fallback preserved as an ops kill-switch), without changing the public GraphQL contract.

## Decisions (locked)

### 1) Projection inconsistency fallback policy
- **Chosen**: **Option 3 — combined triggers**, but fallback **only on unsafe inconsistencies**.
- **Implementation intent**:
  - Fallback when **cursor safety** is compromised (cannot advance, duplicates across pages, ordering invariant breaks).
  - Fallback when **hydration gap** is unsafe (high missing ratio / entries exist but hydrate nothing).
  - Fallback on **systemic projection-read errors** (sanitized) to preserve availability.

### 2) `READ_REQUIRE_POPULATED` + empty projection behavior
- **Chosen**: **Option 3 — fallback to legacy and enqueue bootstrap best-effort**.
- **Implementation intent**:
  - Never error the request due to projection cold-start.
  - Bootstrap enqueue must not fail the request.

### 3) Visibility source-of-truth (projection vs live post eligibility)
- **Chosen**: **Option 2 — always re-check post eligibility at read time**.
- **Implementation intent**:
  - Apply block/mute/moderation/account-state filters during read even if `HomeFeedEntry` exists.

### 4) Hide vs delete semantics for projection entries
- **Chosen**: **Option 3 — hybrid**.
- **Implementation intent**:
  - **Hard delete** on post deletion / moderation removal.
  - **`hiddenAt`** for relationship-based hiding (unfollow/block-like effects).

### 5) Index/schema changes + migrations
- **Chosen**: **Option 2 — update `prisma/schema.prisma` only and flag migration required**.
- **Note**: Developer will create the MySQL migration after schema update.

### 6) Outbox payload validation strictness
- **Chosen**: **Option 2 — ignore optional/unknown fields but log/metric**; strict for required identifiers.
- **Implementation intent**:
  - Required IDs missing → permanent error.
  - Optional/unknown fields → ignore + observability.

### 7) Parameter-level decisions strategy
- **Chosen**: **Option 3 — lock minimum set now, iterate SLO numbers after measurement**.
- **Minimum set to lock**:
  - Fallback thresholds (e.g., unsafe missing ratio).
  - Mismatch taxonomy for shadow-compare actions.
  - Supported env-flag combinations + invariants.

### 8) Plan artifact creation
- **Chosen**: **Option 1 — create this file now**.

## Rollout posture (locked)
- Keep legacy fanout-on-read until **parity metrics are consistently green**, then demote legacy to **emergency-only**.
- Shadow-compare is **metrics-first**, with **targeted** cleanup/bootstrap enqueues for specific mismatch classes (not for every mismatch).


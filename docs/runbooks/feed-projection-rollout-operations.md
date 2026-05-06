# Home feed projection — local rollout verification workbook

Use this document for this repository's **local/development verification**. The project is a learning/demo backend intended for GitHub, not a live production service, so production-only rollout evidence is **not applicable** unless the project is later deployed to a real environment with real traffic.

Supporting detail: `docs/plans/feed-projection-rollout.md`, `src/posts/HOME_FEED_PROJECTION.md`, `docs/runbooks/outbox-backlog.md`.

## Environment scope

This repository currently has a local/development runtime, for example:

```env
NODE_ENV=development
```

Production-style rollout gates are documented as operational requirements, but they must not be marked complete without a real deployed environment. For this project, evidence should come from local/dev verification using seeded data, manual GraphQL tests, application logs, health checks, database queries, and metrics if they are available locally.

| Environment type | Status | How to treat it |
| --- | --- | --- |
| `development` / local | Applicable | Use this workbook to verify the feature locally. |
| `prod` config/profile, if present | Demo only unless deployed | Do not record production sign-off unless it is a real deployed environment. |
| Real production traffic | Not applicable | Mark production-only gates as `N/A` for this learning project. |

## Completion status

This workbook is the **verification record**, not the repository engineering plan. The repository-side implementation can be complete even when real rollout evidence is not available.

Do not fake production evidence. A production-only checkbox should be marked `N/A` when there is no live environment.

**Repository engineering completion record:**

- [x] Projection read rollout controls are implemented and documented in `docs/plans/feed-projection-rollout.md`.
- [x] Shadow compare, fallback, read-source, reconciliation, and purge metrics are documented in `src/posts/HOME_FEED_PROJECTION.md`.
- [x] Prometheus alert rules are present in `monitoring/prometheus/outbox-feed-projection-alerts.yml`.
- [x] Grafana dashboard coverage is present in `monitoring/grafana/outbox-feed-projection-dashboard.json`.
- [x] Outbox rollback and backlog operations are documented in `docs/runbooks/outbox-backlog.md`.
- [x] Remaining production rollout work is not applicable unless the project is deployed to a real production environment.

**Local/demo verification status:**

- [ ] Local API starts successfully.
- [ ] Local worker starts successfully or the configured local worker mode is documented.
- [ ] Feed projection outbox events are created for feed-relevant actions.
- [ ] Worker processes `feed.home.*` events without unexpected failures.
- [ ] `HomeFeedEntry` rows are created or updated as expected.
- [ ] Projection feed output matches legacy feed output on seeded/manual test data.
- [ ] Projection fallback path is verified.
- [ ] Documentation states that production rollout gates are `N/A` for the current project scope.

## Environment record

| Field | Value |
| --- | --- |
| Environment name | `development` / local |
| Runtime mode | `NODE_ENV=development` |
| Operator / owner | |
| Date verification started | |
| Evidence source | Local logs, DB queries, health endpoint, manual GraphQL tests, optional local Prometheus/Grafana |
| Production rollout status | `N/A` — no real production deployment |
| Notes | |

---

## 0 — Local preconditions

- [ ] API process starts successfully.
- [ ] Worker process starts successfully, or local single-process worker behavior is documented.
- [ ] Worker has `OUTBOX_ENABLED=true` when validating projection processing.
- [ ] Feed projection enqueueing is enabled when validating projection writes.
- [ ] Database migrations/schema are applied locally.
- [ ] Seeded or manual test data exists for at least:
  - [ ] one viewer user,
  - [ ] one followed author,
  - [ ] one non-followed author,
  - [ ] multiple posts with different `createdAt` values.
- [ ] Optional local metrics stack is running, or metrics checks are replaced with logs/DB queries.

**Local precondition sign-off:** date ______ operator ______

---

## 1 — Local baseline record

For this learning project, baselines do not need 24–48 hours of real traffic. Capture a starting snapshot before enabling projection reads or shadow comparison.

| Signal | Local check | Value / evidence |
| --- | --- | --- |
| API is healthy | `GET /health/ready` | |
| Worker is active | logs or `outbox_worker_ticks_total{process="worker"}` if metrics are running | |
| Pending outbox count | DB query or `outbox_pending_count{process="worker"}` | |
| Failed outbox count | DB query or `outbox_failed_count{process="worker"}` | |
| `feed.home.*` failures | logs, DB rows, or `outbox_events_total{event_type=~"feed\\.home\\..+",outcome=~"failed_permanent|failed_exhausted"}` | |
| `HomeFeedEntry` count before test | DB count | |
| Legacy feed output for test viewer | GraphQL result or saved JSON | |
| Projection feed output for test viewer | GraphQL result or saved JSON | |

**Baseline sign-off:** date ______ operator ______

---

## 2 — Phase 0 — Populate projection locally

**Goal:** prove projection rows are produced and processed while broad reads can still use the legacy path.

Suggested local flags:

- [ ] `FEED_PROJECTION_ENQUEUE_ENABLED=true`
- [ ] `FEED_PROJECTION_WORKER_ENABLED=true`
- [ ] `OUTBOX_ENABLED=true` for the worker
- [ ] `FEED_PROJECTION_READ_ENABLED=false`
- [ ] `FEED_PROJECTION_READ_COHORT_ENABLED=false`

**Local checks before leaving Phase 0:**

- [ ] Create a feed-relevant action, such as a followed user publishing a post.
- [ ] Confirm an outbox row exists for a `feed.home.*` event.
- [ ] Confirm the worker processes the event.
- [ ] Confirm `HomeFeedEntry` rows are created for the expected viewer(s).
- [ ] Confirm there are no unexpected `feed.home.*` permanent/exhausted failures.
- [ ] Confirm `/health/ready` reports the outbox summary without hiding DB/cache/pubsub failures.

**Useful DB checks:**

```sql
SELECT id, eventType, aggregateType, aggregateId, status, createdAt
FROM OutboxEvent
WHERE eventType LIKE 'feed.home.%'
ORDER BY createdAt DESC
LIMIT 20;
```

```sql
SELECT userId, postId, authorId, createdAt
FROM HomeFeedEntry
ORDER BY createdAt DESC
LIMIT 20;
```

**Phase 0 local sign-off:** date ______ operator ______

---

## 3 — Phase 1 — Shadow compare locally

**Goal:** prove projection output matches legacy output on controlled local data.

Shadow compare runs only after a successful projection read for that request.

Suggested local progression:

1. [ ] Set `FEED_PROJECTION_SHADOW_COMPARE_ENABLED=true`.
2. [ ] Use `FEED_PROJECTION_SHADOW_COMPARE_FORCE_USER_ID=<viewerUserId>` for a known local user.
3. [ ] If needed, use `FEED_PROJECTION_READ_FORCE_USER_ID=<viewerUserId>` so the test user exercises projection reads.
4. [ ] Run the feed query multiple times after creating, following, unfollowing, hiding, or cleaning up relevant data.

**Local Phase 1 gates:**

- [ ] Order matches legacy output.
- [ ] `hasNextPage` matches legacy output.
- [ ] Membership matches legacy output, or each intentional difference is explained.
- [ ] Any fallback is explained by a known test condition.
- [ ] No unexpected `feed.home.*` permanent/exhausted failures are present.

For production, the original plan requires at least 6 hours of steady shadow comparison and strict metric gates. For this repository, that requirement is `N/A` unless the project is deployed to a real environment.

**Phase 1 local sign-off:** date ______ operator ______

---

## 4 — Phase 2 — Cohort projection reads

For this learning project, real cohort ramping is **N/A** because there is no real traffic population.

Use a simulated local ramp instead:

| Step | Local setting | Expected result | Evidence |
| --- | --- | --- | --- |
| Forced user | `FEED_PROJECTION_READ_FORCE_USER_ID=<viewerUserId>` | Only the chosen user reads from projection | |
| Small cohort simulation | `FEED_PROJECTION_READ_COHORT_ENABLED=true`, low sample rate | Some deterministic users read from projection if enough seeded users exist | |
| Full local cohort | `FEED_PROJECTION_READ_COHORT_SAMPLE_RATE=1.0` | Eligible local users read from projection | |

**Local Phase 2 gates:**

- [ ] Projection read source is observed for the expected local user(s).
- [ ] Legacy read source still works when projection is disabled.
- [ ] Fallback to legacy works when projection read fails or cannot hydrate enough rows.
- [ ] Order and `hasNextPage` remain correct in manual tests.
- [ ] No unexpected `feed.home.*` failures are present.

**Phase 2 local sign-off:** date ______ operator ______

---

## 5 — Phase 3 — Global projection reads

Real global enablement and 7-day production observation are **N/A** for this repository unless it is later deployed to a real production environment.

For local/demo verification, this phase means enabling projection reads locally and proving the app still behaves correctly.

- [ ] Set `FEED_PROJECTION_READ_ENABLED=true` locally.
- [ ] Run the main home-feed GraphQL query for the test viewer.
- [ ] Confirm the result uses projection reads when expected.
- [ ] Confirm legacy fallback still works by disabling projection reads or forcing a safe fallback scenario.
- [ ] Confirm no unexpected worker errors appear in logs.

**Rollback check:**

1. [ ] Set `FEED_PROJECTION_READ_ENABLED=false`.
2. [ ] If cohort reads are enabled, set `FEED_PROJECTION_READ_COHORT_ENABLED=false` or lower `FEED_PROJECTION_READ_COHORT_SAMPLE_RATE`.
3. [ ] Keep `FEED_PROJECTION_ENQUEUE_ENABLED=true` and `FEED_PROJECTION_WORKER_ENABLED=true` when possible so projection can continue to catch up.

**Phase 3 local sign-off:** date ______ operator ______

---

## 6 — Purge decision (`FEED_PROJECTION_PURGE_ENABLED`)

For a local learning project, purge can be either tested locally or explicitly deferred.

Choose one:

- [ ] **Deferred:** `FEED_PROJECTION_PURGE_ENABLED=false` because local data volume does not require retention cleanup.
- [ ] **Tested locally:** purge is enabled only long enough to prove bounded cleanup behavior on seeded data.

Do not claim production purge safety unless there is a real production table-growth pattern and retention requirement.

If tested locally:

- [ ] Review `FEED_PROJECTION_RETENTION_DAYS`.
- [ ] Review `FEED_PROJECTION_RETENTION_MAX_ITEMS_PER_USER`.
- [ ] Review `FEED_PROJECTION_PURGE_INTERVAL_MS`.
- [ ] Seed enough old `HomeFeedEntry` rows to make purge behavior observable.
- [ ] Confirm purge deletes only eligible rows.
- [ ] Confirm purge logs/metrics show bounded execution and no errors.

**Purge decision:** deferred/tested ______ date ______ operator ______

---

## 7 — Deprecation bookkeeping

Legacy read-path removal is **not recommended** for this learning project unless you intentionally want to simplify the demo after proving projection reads.

Production rule, if ever deployed: after `FEED_PROJECTION_READ_ENABLED=true` is the default for all eligible users, wait at least 8 weeks before reviewing removal of legacy-only paths.

| Field | Value |
| --- | --- |
| 100% local projection-read enablement date | |
| Production enablement date | `N/A` |
| Earliest production legacy-removal review date | `N/A` unless deployed |
| Local decision | Keep legacy fallback / remove for demo simplicity |
| Owner | |

Recommended local decision: keep legacy fallback because it demonstrates safer production-style architecture.

---

## 8 — Final local verification summary

Use this section as the GitHub-facing completion note.

```md
Status: Implementation complete for learning/demo scope.

Production rollout status: Not applicable. This repository is not deployed to a real production environment and has no real production traffic.

Verification scope: Local/development verification using seeded data, manual GraphQL tests, local logs, health checks, database queries, and optional local metrics.
```

**Final local sign-off:** date ______ operator ______

---

## 9 — Optional follow-ups

Defer unless useful for learning or portfolio polish:

- Add screenshots of local Grafana panels if the metrics stack is running.
- Add a short demo script for creating users/posts/follows and verifying `HomeFeedEntry` rows.
- Add one end-to-end test for projection vs legacy feed equivalence.
- Add one rollback demo showing projection reads disabled while enqueue/worker stay enabled.

# Outbox Backlog Runbook

This runbook covers the first-response checks for outbox backlog, stuck processing, and home-feed projection worker health.

For phased projection **read** rollout, local verification, purge decisions, and production-only `N/A` bookkeeping, use `docs/runbooks/feed-projection-rollout-operations.md`.

## Project scope note

This repository is currently a learning/demo project with local/development verification only. Production traffic gates, multi-day rollout holds, and production operator sign-off are not applicable unless the project is later deployed to a real environment.

Use this runbook locally to prove that the worker, outbox events, projection processing, fallback behavior, and health summaries work correctly.

## Confirm the worker is running

- Check that `outbox_worker_ticks_total{process="worker"}` is increasing when local metrics are enabled.
- If metrics are not running locally, check worker logs for polling ticks, claimed events, processed events, retry scheduling, or handler errors.
- If worker activity is flat, confirm the worker process is started with `OUTBOX_ENABLED=true`.
- Confirm the API and worker processes are both observable. In local development, logs are acceptable evidence if Prometheus is not running.

## Distinguish producer spike vs stuck worker

Producer spike signs:

- `outbox_pending_count{process="worker"}` rises.
- `outbox_events_total{process="worker",outcome="processed"}` is still increasing.
- `outbox_oldest_pending_age_seconds{process="worker"}` rises briefly, then falls as the worker catches up.

Stuck worker signs:

- `outbox_processing_count{process="worker"}` remains above zero.
- `outbox_oldest_processing_age_seconds{process="worker"}` keeps increasing.
- `outbox_worker_tick_errors_total{process="worker"}` is increasing.
- `outbox_events_total{process="worker",outcome="processed"}` is flat or much lower than normal.

In local development, confirm the same behavior with database rows and logs if metrics are unavailable.

## Interpret backlog gauges

- `outbox_pending_count`: rows waiting to be claimed or retried.
- `outbox_failed_count`: rows permanently failed or exhausted.
- `outbox_processing_count`: rows claimed by a worker and not yet completed.
- `outbox_oldest_pending_age_seconds`: oldest pending wait time.
- `outbox_oldest_processing_age_seconds`: oldest processing age; sustained growth suggests a stuck claim or failing handler.

If `metrics_db_refresh_errors_total{process="worker",component="outbox"}` is increasing, backlog gauges may be stale. Check application logs for the sanitized refresh error and verify database connectivity.

## Feed projection correctness triage

Use these metrics before increasing the projection-read rollout percentage in a real environment, or before marking local simulation steps complete:

- `home_feed_read_source_total{process="api",source="projection|legacy"}` shows the served-via split.
- `home_feed_projection_fallback_total{process="api",reason="..."}` shows silent projection-to-legacy fallback volume by reason.
- `home_feed_shadow_compare_mismatch_by_category_total{process="api",category="order|membership|has_next_page"}` splits live shadow-compare drift by rollout gate category.
- `home_feed_projection_reconciliation_total{process="worker",outcome="match|mismatch|error",category="..."}` reports the observe-only worker reconciliation loop.

Treat `order` and `has_next_page` mismatches as cursor-semantics risk. Disable projection reads first, then inspect the logged first divergent index, item counts, and ids. Treat sustained `membership` mismatches as projection lag, cleanup, block/mute, or fanout/backfill drift until confirmed otherwise.

Fallbacks are report-only to clients because reads silently use the legacy path. Break them down by reason before ramping: `missing_hydration_gap` points at stale or unhydratable projection rows, while `read_error` points at projection read failures.

For local verification, it is enough to show that:

- projection output matches legacy output for seeded/manual data,
- fallback returns legacy output when projection cannot be used,
- unexpected `feed.home.*` failures are absent.

Rollback order:

1. Set `FEED_PROJECTION_READ_ENABLED=false`.
2. If cohort reads are enabled, set `FEED_PROJECTION_READ_COHORT_ENABLED=false` or lower `FEED_PROJECTION_READ_COHORT_SAMPLE_RATE`.
3. Keep `FEED_PROJECTION_ENQUEUE_ENABLED=true` and `FEED_PROJECTION_WORKER_ENABLED=true` when possible so projection can catch up while reads use the legacy path.
4. Disable enqueue or worker only if the incident is caused by projection event production or processing itself.

## Interpret backlog by eventType

Use `GET /health/ready` for the per-event-type backlog view:

- `summary.outbox.byEventType.<eventType>.pendingCount`
- `summary.outbox.byEventType.<eventType>.failedCount`
- `summary.outbox.byEventType.<eventType>.processingCount`
- `summary.outbox.byEventType.<eventType>.oldestPendingAgeMs`
- `summary.outbox.byEventType.<eventType>.oldestProcessingAgeMs`

Readiness is report-only for outbox backlog. Pending, failed, or processing outbox rows do not make `/health/ready` return `status: "error"` while DB, cache, and pubsub dependencies are healthy. Use alerts and the summary fields to decide whether operator action is required.

Known feed projection event types:

- `feed.home.post.fanout`
- `feed.home.follow.backfill`
- `feed.home.user.bootstrap`
- `feed.home.post.cleanup`
- `feed.home.relationship.hide`

Known notification delivery event types:

- `notification.commentReply.deliver`
- `notification.followRequest.deliver`

The `unknown` bucket rolls up pending, failed, or processing rows whose `eventType` is not in the known allowlist. Treat non-zero `unknown` counts as an uncontrolled producer or unsupported event-type deployment issue until proven otherwise.

## Register durable handlers

Durable outbox processing is routed through the handler registry in `src/outbox`. A handler declares the event types it supports through `OutboxDurableEventHandler.eventTypes` and implements `handle(...)`; use `preDispatch(...)` only for handler-owned gating such as intentionally rescheduling feed projection rows while `FEED_PROJECTION_WORKER_ENABLED=false`.

When adding a durable event type, register the handler through `OUTBOX_EVENT_HANDLERS`, add the event type to the readiness allowlist only when it should have its own `/health/ready` bucket, and keep retry/permanent-failure behavior inside the handler by throwing normal errors or `OutboxPermanentError` as appropriate.

## Handle failed events

- Inspect failed rows by `eventType`, `aggregateType`, `aggregateId`, `attemptCount`, and sanitized `lastError`.
- Fix handler/config/data issues before requeueing rows.
- Requeue only rows whose underlying cause is understood.
- Do not delete failed rows just to clear an alert unless retention policy or an explicit incident decision says to.

## Safe toggles

- `OUTBOX_ENABLED`: controls the worker polling loop.
- `OUTBOX_BATCH_SIZE`: controls claim batch size.
- `OUTBOX_MAX_ATTEMPTS`: controls retry exhaustion.
- `FEED_PROJECTION_ENQUEUE_ENABLED`: controls enqueueing home-feed projection events from write/read flows.
- `FEED_PROJECTION_WORKER_ENABLED`: controls whether the worker processes home-feed projection events.
- `FEED_PROJECTION_PURGE_ENABLED`: controls periodic projected-feed retention cleanup.

If `FEED_PROJECTION_WORKER_ENABLED=false`, feed projection events are rescheduled as `retry_scheduled` and should not be treated as handler failures. This creates intentional backlog for `feed.home.*` rows, visible in `summary.outbox.byEventType` and `outbox_events_total{outcome="retry_scheduled"}`.

## Local evidence checklist

Use this checklist when updating the local rollout workbook:

- [ ] Worker startup log or metric captured.
- [ ] Recent `feed.home.*` outbox rows captured.
- [ ] `HomeFeedEntry` rows captured after worker processing.
- [ ] `/health/ready` outbox summary captured.
- [ ] Projection vs legacy feed result compared for at least one test viewer.
- [ ] Rollback toggle behavior verified locally.

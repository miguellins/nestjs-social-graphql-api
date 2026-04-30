# Outbox Backlog Runbook

This runbook covers the first-response checks for outbox backlog, stuck
processing, and home-feed projection worker health.

## Confirm the worker is running

- Check that `outbox_worker_ticks_total{process="worker"}` is increasing.
- If it is flat, confirm the worker process is deployed and started with
  `OUTBOX_ENABLED=true`.
- Confirm Prometheus is scraping the worker metrics endpoint, not only the API
  metrics endpoint.

## Distinguish producer spike vs stuck worker

Producer spike signs:

- `outbox_pending_count{process="worker"}` rises.
- `outbox_events_total{process="worker",outcome="processed"}` is still
  increasing.
- `outbox_oldest_pending_age_seconds{process="worker"}` rises briefly, then
  falls as the worker catches up.

Stuck worker signs:

- `outbox_processing_count{process="worker"}` remains above zero.
- `outbox_oldest_processing_age_seconds{process="worker"}` keeps increasing.
- `outbox_worker_tick_errors_total{process="worker"}` is increasing.
- `outbox_events_total{process="worker",outcome="processed"}` is flat or much
  lower than normal.

## Interpret backlog gauges

- `outbox_pending_count`: rows waiting to be claimed or retried.
- `outbox_failed_count`: rows permanently failed or exhausted.
- `outbox_processing_count`: rows claimed by a worker and not yet completed.
- `outbox_oldest_pending_age_seconds`: oldest pending wait time.
- `outbox_oldest_processing_age_seconds`: oldest processing age; sustained
  growth suggests a stuck claim or failing handler.

If `metrics_db_refresh_errors_total{process="worker",component="outbox"}` is
increasing, backlog gauges may be stale. Check application logs for the
sanitized refresh error and verify database connectivity.

## Handle failed events

- Inspect failed rows by `eventType`, `aggregateType`, `aggregateId`,
  `attemptCount`, and sanitized `lastError`.
- Fix handler/config/data issues before requeueing rows.
- Requeue only rows whose underlying cause is understood.
- Do not delete failed rows just to clear an alert unless retention policy or an
  explicit incident decision says to.

## Safe toggles

- `OUTBOX_ENABLED`: controls the worker polling loop.
- `OUTBOX_BATCH_SIZE`: controls claim batch size.
- `OUTBOX_MAX_ATTEMPTS`: controls retry exhaustion.
- `FEED_PROJECTION_ENQUEUE_ENABLED`: controls enqueueing home-feed projection
  events from write/read flows.
- `FEED_PROJECTION_WORKER_ENABLED`: controls whether the worker processes
  home-feed projection events.
- `FEED_PROJECTION_PURGE_ENABLED`: controls periodic projected-feed retention
  cleanup.

If `FEED_PROJECTION_WORKER_ENABLED=false`, feed projection events are
rescheduled as `retry_scheduled` and should not be treated as handler failures.

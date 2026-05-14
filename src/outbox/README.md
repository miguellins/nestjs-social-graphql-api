# Outbox Module
The outbox module provides durable background event processing for work that should happen after the main database write succeeds.

## What this feature does
Today, the outbox is used for:

- comment reply notification delivery
- private follow-request notification delivery
- home-feed projection fanout, follow backfill, user bootstrap, post cleanup,
  and relationship hiding

The notification delivery flow is:
1. A user creates a reply comment.
2. The app persists the reply comment inside the main transaction.
3. When durable reply delivery is enabled, the app also persists the notification row and an `outboxEvent` row in the same transaction.
4. A worker later claims the pending outbox row and dispatches the follow-up delivery work.
5. The worker marks the event as processed, retries it, or marks it as failed.

The feed-projection flow is similar, but the outbox row describes projection
maintenance work such as fanning out a new post or hiding entries after a block,
unfollow, moderation removal, or privacy-sensitive relationship change.

This pattern keeps the database write path correct even if realtime delivery is temporarily unavailable.

## Why it exists
Without an outbox, a mutation may succeed in the database but fail during post-commit delivery work such as publishing a realtime notification.

The outbox solves that by separating:
- correctness-critical writes:
  the comment and notification rows
- best-effort follow-up work:
  realtime delivery and similar background processing

That means the source of truth is persisted first, and delivery can be retried safely afterward.

## Main pieces
- `outbox.module.ts`
  wires the outbox services into the application
- `outbox.service.ts`
  persists events, claims pending rows, updates status, purges old rows, and exposes readiness summary data
- `outbox-processor.service.ts`
  processes claimed rows, dispatches handlers, applies retry backoff, and marks permanent failures
- `outbox-worker.service.ts`
  runs the polling loop when worker processing is enabled and optionally purges
  old home-feed projection rows
- `events/comment-reply-notification-delivery.event.ts`
  defines the comment-reply notification delivery event name and payload shape
- `events/follow-request-notification-delivery.event.ts`
  defines the follow-request notification delivery event name and payload shape
- `events/home-feed-*.event.ts`
  define the home-feed projection event names and payload shapes
- `posts/home-feed-outbox.handler.ts`
  handles feed-projection events claimed by the outbox processor

## Current supported events
The currently handled events are:
- `notification.commentReply.deliver`
- `notification.followRequest.deliver`
- `feed.home.post.fanout`
- `feed.home.follow.backfill`
- `feed.home.user.bootstrap`
- `feed.home.post.cleanup`
- `feed.home.relationship.hide`

Comment reply payload contains the persisted identifiers needed to deliver a `COMMENT_REPLIED` notification:
- `notificationId`
- `recipientId`
- `actorId`
- `commentId`
- `notificationType`

Follow-request payload contains the persisted identifiers needed to deliver a `FOLLOW_REQUESTED` notification:
- `notificationId`
- `recipientId`
- `actorId`
- `followRequestId`
- `notificationType`

Home-feed payloads contain the stable post, author, follower, or user
identifiers needed to maintain `HomeFeedEntry` rows. The feed projection worker
flag controls whether these events are processed; when it is disabled, feed
events are rescheduled instead of burning retry attempts.

## Status lifecycle
An outbox row moves through these states:
- `PENDING`
  ready to be claimed by the worker
- `PROCESSING`
  currently claimed by a worker
- `PROCESSED`
  handled successfully
- `FAILED`
  permanently failed or exhausted retries

Transient failures are rescheduled with exponential backoff plus jitter. Permanent errors and exhausted retries are marked as failed.

## Configuration
- `OUTBOX_COMMENT_REPLIED_ENABLED`
  enables durable outbox-backed handling for comment reply notifications
- `OUTBOX_FOLLOW_REQUESTED_ENABLED`
  enables durable outbox-backed handling for private follow-request notifications
- `OUTBOX_ENABLED`
  enables worker polling and processing
- `OUTBOX_POLL_INTERVAL_MS`
  controls how often the worker polls
- `OUTBOX_BATCH_SIZE`
  controls how many events the worker tries to claim per batch
- `OUTBOX_MAX_ATTEMPTS`
  controls how many retries are allowed before a row is marked failed
- `OUTBOX_PROCESSED_RETENTION_HOURS`
  controls processed-row retention
- `OUTBOX_FAILED_RETENTION_HOURS`
  controls failed-row retention
- `FEED_PROJECTION_ENQUEUE_ENABLED`
  enables enqueueing home-feed projection events from write and read flows
- `FEED_PROJECTION_WORKER_ENABLED`
  allows the worker to process home-feed projection event types
- `FEED_PROJECTION_BACKFILL_ENABLED`
  enables follow-related backfill enqueueing
- `FEED_PROJECTION_PURGE_ENABLED`
  enables periodic projected-feed retention cleanup from the worker
- `FEED_PROJECTION_PURGE_INTERVAL_MS`
  controls how often the worker attempts projection cleanup

## Operational behavior
`GET /health/ready` includes an outbox summary with:
- `enabled`
- `pendingCount`
- `failedCount`
- `oldestPendingAgeMs`

The summary is intended to show whether the outbox surface is active and whether backlog is building up.

## How to run it
API only, durable reply mode on, worker off:
```bash
OUTBOX_COMMENT_REPLIED_ENABLED=true OUTBOX_ENABLED=false npm run start:dev
```

API only, durable follow-request mode on, worker off:
```bash
OUTBOX_FOLLOW_REQUESTED_ENABLED=true OUTBOX_ENABLED=false npm run start:dev
```

Dedicated worker:
```bash
OUTBOX_COMMENT_REPLIED_ENABLED=true OUTBOX_FOLLOW_REQUESTED_ENABLED=true OUTBOX_ENABLED=true npm run start:worker:dev
```

This lets the API persist outbox rows while the worker drains them separately.

Dedicated worker with feed-projection processing:
```bash
OUTBOX_ENABLED=true FEED_PROJECTION_WORKER_ENABLED=true FEED_PROJECTION_PURGE_ENABLED=true npm run start:worker:dev
```

## When to extend this module
Add a new outbox event when follow-up work:
- should not make the mutation fail after the main write commits
- must be retried safely
- should be processed from persisted state instead of in-memory fire-and-forget delivery

To extend it:
1. define a new event constant and payload type
2. enqueue it after the source row is persisted
3. add a processor dispatch branch
4. implement a handler for the background work
5. add tests for enqueue, processing, retry, and readiness behavior

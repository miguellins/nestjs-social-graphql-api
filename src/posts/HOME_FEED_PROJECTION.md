# Home Feed Projection

The home feed projection is an optional persisted read model for the authenticated
`homeFeed` GraphQL query.

## What it does

The feature stores eligible posts in `HomeFeedEntry` rows so `homeFeed` can read
from a user-specific feed table instead of rebuilding the feed from follower
relationships on every request.

When projection reads are disabled, `homeFeed` keeps using the existing
fanout-on-read behavior:

- find posts from the current user and followed authors
- filter removed posts, inactive authors, and blocked authors
- return a bounded cursor page ordered by post creation time

When projection reads are enabled for a user, `homeFeed` reads ordered
`HomeFeedEntry` rows first, loads the matching posts by id, applies the same
post safety filters, and returns the same public home-feed item shape.

## Why it exists

The legacy read path is correct, but it must join across follow relationships at
request time. The projection moves most of that work to background processing:

- post creation fans the post out to the author and their followers
- follow acceptance or follow creation can backfill recent posts
- first projection reads can enqueue a user bootstrap when the projection is not
  populated yet
- cleanup events remove or hide stale projection rows

This keeps the GraphQL contract stable while making the read path easier to
scale gradually.

## Main pieces

- `feed-read.service.ts`
  chooses between legacy reads and projection reads, bootstraps empty
  projections, shadow-compares rollout cohorts, and cleans up missing projected
  posts best-effort.
- `home-feed-projection.service.ts`
  writes, backfills, bootstraps, hides, deletes, and purges `HomeFeedEntry`
  rows.
- `home-feed-outbox.handler.ts`
  dispatches durable outbox events into projection work.
- `outbox/events/home-feed-*.event.ts`
  define the event names and payloads used by the projection.
- `prisma/schema.prisma`
  defines `HomeFeedEntry` and `HomeFeedEntryReason`.

## Event flow

The projection is driven by outbox events so feed maintenance can be retried
without making the original mutation depend on background work.

Handled events:

- `feed.home.post.fanout`
  inserts a new post into the author's home feed and their followers' home
  feeds.
- `feed.home.follow.backfill`
  inserts recent posts from a followed user into the follower's home feed.
- `feed.home.user.bootstrap`
  builds an initial projected feed for an existing user from followed authors.
- `feed.home.post.cleanup`
  deletes projected entries for a missing or removed post.
- `feed.home.relationship.hide`
  soft-hides projected entries for a user-author relationship.

Projection writes use `createMany(..., skipDuplicates: true)` where duplicate
delivery is safe.

## Read behavior

Projection reads are controlled by configuration. A rollout can target all users,
a sampled cohort, or one forced user id.

If `FEED_PROJECTION_READ_REQUIRE_POPULATED` is true and a user's projection is
empty, the service enqueues `feed.home.user.bootstrap` best-effort and falls
back to the legacy read path for that request.

Projection reads still filter:

- hidden projection entries
- removed posts
- inactive authors
- authors blocked by the current user

If a projection row points to a post that can no longer be returned, the read
path enqueues cleanup best-effort.

## Retention and cleanup

`HomeFeedProjectionService` can purge old or excessive entries:

- time-based retention uses `FEED_PROJECTION_RETENTION_DAYS`
- per-user cap retention uses `FEED_PROJECTION_RETENTION_MAX_ITEMS_PER_USER`
- purge scheduling is controlled by `FEED_PROJECTION_PURGE_ENABLED` and
  `FEED_PROJECTION_PURGE_INTERVAL_MS`

The purge keeps the projection bounded and focuses per-user cap cleanup on users
currently over the configured limit.

## Configuration

- `FEED_PROJECTION_ENQUEUE_ENABLED`
  enables enqueueing projection outbox events from write and read flows.
- `FEED_PROJECTION_WORKER_ENABLED`
  allows the outbox worker to process home-feed projection events.
- `FEED_PROJECTION_READ_ENABLED`
  enables projection reads globally.
- `FEED_PROJECTION_BACKFILL_ENABLED`
  enables follow-related backfill event enqueueing.
- `FEED_PROJECTION_PURGE_ENABLED`
  enables periodic projection purge work in the outbox worker.
- `FEED_PROJECTION_RETENTION_DAYS`
  controls time-based retention.
- `FEED_PROJECTION_RETENTION_MAX_ITEMS_PER_USER`
  controls the maximum retained entries per user.
- `FEED_PROJECTION_PURGE_INTERVAL_MS`
  controls how often purge work runs.
- `FEED_PROJECTION_FANOUT_BATCH_SIZE`
  controls projection insert batch size.
- `FEED_PROJECTION_FOLLOWER_PAGE_SIZE`
  controls follower paging during post fanout.
- `FEED_PROJECTION_SHADOW_COMPARE_ENABLED`
  enables comparison between projection and legacy results.
- `FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY`
  prevents sampled shadow comparison unless a forced user id is configured.
- `FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE`
  controls sampled shadow comparison.
- `FEED_PROJECTION_SHADOW_COMPARE_FORCE_USER_ID`
  forces shadow comparison for one user.
- `FEED_PROJECTION_READ_COHORT_ENABLED`
  enables sampled projection reads.
- `FEED_PROJECTION_READ_COHORT_SAMPLE_RATE`
  controls sampled projection-read rollout.
- `FEED_PROJECTION_READ_FORCE_USER_ID`
  forces projection reads for one user.
- `FEED_PROJECTION_READ_REQUIRE_POPULATED`
  requires at least one visible projection row before serving projection reads.

## Operational notes

- Keep the legacy fanout-on-read path available during rollout.
- Enable enqueueing before enabling projection reads so rows can be populated.
- Use shadow compare before broad read rollout to detect ordering or membership
  differences.
- Run a worker with `FEED_PROJECTION_WORKER_ENABLED=true` to drain projection
  events.
- Projection delivery is best-effort after source writes; the database write path
  remains the source of truth.

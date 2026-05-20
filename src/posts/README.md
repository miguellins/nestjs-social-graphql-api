# Posts Module

The posts module owns post creation and updates, public and viewer-aware post reads, and feed-oriented read paths.

## What this module covers

- public post listing
- public post detail reads
- public posts-by-username reads
- authenticated `myFeed`
- authenticated `homeFeed`
- post creation, update, and delete
- moderator post removal
- viewer-aware post visibility
- inline post comments and media on detail reads
- optional persisted home-feed projection through outbox events

## Important behavior

- post reads are privacy-aware and block-aware
- public post reads are anonymous when no valid `Authorization: Bearer <token>`
  is provided; viewer-specific `POSTS` mute filtering requires a valid bearer
  token so `@CurrentUser()` can pass the viewer into the service
- `postById` returns `commentsCount` and inline comments when available
- post detail views also carry `viewsCount`
- cache invalidation is versioned and targeted
- `myFeed` is the legacy authenticated relational feed
- `homeFeed` is a distinct read surface that can use the legacy path or the
  optional `HomeFeedEntry` projection depending on rollout flags
- post creation, moderation removal, follows, blocks, and relationship changes
  can enqueue projection maintenance work when feed projection enqueueing is enabled

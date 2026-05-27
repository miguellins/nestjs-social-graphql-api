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

## GraphQL Surface

Public reads:

- `posts`
- `postById`
- `postsByUsername`

Authenticated reads:

- `myFeed`
- `homeFeed`

Authenticated writes:

- `createPost`
- `updatePost`
- `deletePost`
- `removePostByModerator`

## Service ownership

- `PostsService` is the resolver-facing facade for feed delegation, post detail reads, anonymous view-count refresh, writes, and moderator removal delegation.
- `PostListReadService` owns public and viewer-aware list reads, username timeline reads, list cache keys, cursor filters, privacy checks, block checks, and POSTS-scope mute checks.
- `PostReadService` owns post detail reads, `myFeed`, visibility filter builders, blocked author lookup, and media/comment read projection integration.
- `PostWriteService` owns create, update, and delete correctness: validation, ownership checks, Prisma transactions, hashtag sync, mention sync, and optional home-feed fanout enqueueing.
- `PostModerationService` owns moderator post removal, moderator role checks, linked-report actioning, moderation action persistence, and moderation-specific hashtag stripping.
- `PostCacheService` owns targeted detail invalidation and version-key bumps for post list, author timeline, hashtag list, and safe-user caches.

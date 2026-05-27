# Hashtags Module

The hashtags module owns hashtag parsing, durable post-hashtag joins, public hashtag discovery, and hashtag timeline reads.

## What this module covers

- validate hashtags before post writes
- normalize hashtag slugs
- sync post hashtag joins after post create/update/moderation changes
- maintain public hashtag post counts
- list posts by hashtag
- search hashtags by prefix

## GraphQL Surface

Public operations with optional viewer context:

- `postsByHashtag`
- `searchHashtags`

## Important behavior

- hashtag slugs are normalized before storage and lookup
- hashtag validation runs before write-side post persistence
- `postsByHashtag` applies normal post visibility rules
- authenticated viewers must be active before viewer-aware hashtag reads
- anonymous hashtag post reads use versioned read-through caching
- `searchHashtags` orders by public `postsCount` and then slug
- page sizes are clamped through shared pagination helpers

## Caching and Side Effects

Current cache keys use versioned list caching:

- post hashtag timelines use `v:posts:list`
- hashtag search uses `v:hashtags:list`

Post writes and moderation flows should bump the relevant versions when hashtag membership or public counts change.

## Service ownership

- `HashtagsService` owns parsing validation, slug normalization, hashtag join reconciliation, public count deltas, hashtag search, and posts-by-hashtag reads.

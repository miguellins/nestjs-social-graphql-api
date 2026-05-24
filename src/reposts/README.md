# Reposts Module

The reposts module owns authenticated repost, undo-repost, and quote-post writes. It uses typed `Post` rows so reposts and quotes can move through the same post read, cache, media, hashtag, mention, and home-feed projection paths as original posts.

## Public operations

- `repostPost(postId: Int!)` creates one `REPOST` wrapper for the viewer and resolves reposts or quotes back to the root original source.
- `undoRepost(postId: Int!)` treats `postId` as the root source id, hard-deletes the viewer's repost wrapper when present, and returns success idempotently.
- `quotePost(input: QuotePostInput!)` creates a `QUOTE` wrapper with validated commentary and an embedded root source preview.
- `reposts(postId: Int!, ...)` lists visible repost wrappers for a root-aware source post.
- `myReposts(...)` lists the authenticated user's repost wrappers with source previews.

## Behavior

- Repost and quote writes require an active authenticated account.
- Sources must pass normal post visibility, block, POSTS-scope mute, removed, and author account-state checks.
- Self-reposts and self-quotes are denied in v1.
- Duplicate active reposts are rejected with a conflict.
- Reposts store empty content and do not sync mentions or hashtags.
- Quotes sync mentions and hashtags from quote commentary only.
- `updatePost` is disallowed for `REPOST` and `QUOTE` rows in v1.
- `deletePost` is disallowed for `REPOST`; clients use `undoRepost`. Quote rows can be deleted through `deletePost`.

## Reads and cache

Post, detail, profile timeline, and home-feed reads expose `kind`, `sourcePostId`, `sourcePost`, `repostsCount`, and `viewerHasReposted`. List and feed reads hide derivative rows when the embedded source cannot be shown; direct detail reads can return an unavailable source tombstone.

Writes reuse `PostCacheService` list-version bumps and detail-key deletion. Repost changes also invalidate the root source detail key, the derivative detail key when known, global post lists, repost list versions, the reposter's repost list, and the reposter/source-author profile timelines.

## Notifications

Repost and quote notifications are best-effort post-commit delivery to the root original source author. Quote commentary also uses the normal post mention pipeline. Separate `postRepostedNotificationsEnabled` and `postQuotedNotificationsEnabled` preferences control these notifications.

# Search Module

`SearchModule` owns MySQL-native V1 discovery beyond hashtag autocomplete.

## GraphQL operations

- `searchPosts(q: String!, first: Int): [Post!]!`
- `searchUsers(q: String!, first: Int): [SafeUser!]!`

Both operations are public, accept an optional authenticated viewer from context, use `THROTTLE_LIMITS.SEARCH`, default `first` to `PAGINATION.DEFAULT_TAKE`, and clamp `first` to `PAGINATION.MAX_TAKE` through the GraphQL DTO and service Zod schemas.

## Query behavior

`searchPosts` normalizes queries by trimming, lowercasing, collapsing whitespace, stripping MySQL FULLTEXT boolean operators, and rejecting unsafe input such as ASCII control characters, no-alphanumeric queries, and long repeated-character runs. It uses MySQL `MATCH(title, content) AGAINST (... IN BOOLEAN MODE)` for candidate IDs, then hydrates through `SafePostListSelect` and existing post visibility, source-availability, block, and POSTS mute filters.

`searchUsers` trims, strips a leading `@`, lowercases, and validates the query with the same abuse guards. It searches only `username` and `name`, never `email`, and only returns `ACTIVE` accounts. Public and private active accounts are discoverable. Authenticated viewers have mutual blocks removed after raw ID lookup.

## Sparse pages

Raw MySQL candidate queries are capped at `LIMIT first`. Viewer-aware Prisma hydration can remove candidates because of privacy, source availability, blocks, mutes, moderation, or account state. Clients must handle fewer than `first` results as a valid V1 response. Over-fetch backfill is deferred.

## Cache keys

Search uses read-through cache with version-key invalidation:

- Posts: `v:search:posts`, TTL 30 seconds, key `search:posts:v{version}:q={normalizedQ}:viewer={id|anon}:first={n}`
- Users: `v:search:users`, TTL 60 seconds, key `search:users:v{version}:q={normalizedQ}:viewer={id|anon}:first={n}`

Post search cache is bumped by post create, update, delete, and moderation removal. User search cache is bumped by user create/update/delete and account-state visibility changes.

## MySQL rollout checks

Before rollout, generate and review a Prisma migration for the `@@fulltext([title, content])` and `@@fulltext([username, name])` schema changes. Agents must not edit `prisma/migrations/` directly.

Validate local/dev MySQL token settings before relying on short-token search:

```sql
SHOW VARIABLES LIKE 'ft_min_word_len';
SHOW VARIABLES LIKE 'innodb_ft_min_token_size';
```

Expected local/dev values for V1 rollout are `2` for both `ft_min_word_len` and `innodb_ft_min_token_size`.

## Existing discovery behavior

`searchHashtags`, `postsByHashtag`, and `posts(q)` are unchanged. `posts(q)` remains a chronological substring filter; `searchPosts` is the relevance-ranked discovery API.

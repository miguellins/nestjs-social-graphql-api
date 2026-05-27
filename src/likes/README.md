# Likes Module

The likes module owns post like reads, like creation, like deletion, post like counters, and post-liked notification triggering.

## What this module covers

- public like list reads
- public like detail reads
- authenticated post like creation
- authenticated like deletion by owner
- transactional `Post.likesCount` updates
- post-liked notification side effects

## GraphQL Surface

Public operations:

- `likes`
- `likeById`

Authenticated operations:

- `createLike`
- `deleteLike`

## Important behavior

- list reads are cursor-paginated and bounded
- reads exclude likes for removed posts
- duplicate likes are rejected through the unique `(userId, postId)` constraint
- creating a like increments `Post.likesCount` in the same transaction
- deleting a like decrements `Post.likesCount` in the same transaction
- only the like owner can delete a like
- post-liked notifications are best-effort after the committed write

## Caching and Side Effects

After like writes, invalidation is best-effort and targeted:

- bump `v:likes:list`
- delete affected `like:detail:{id}` keys on deletion
- delete affected `posts:detail:{postId}` keys
- bump `v:posts:list`
- bump affected author timeline versions

The database write and counter update are correctness-critical. Cache invalidation and notification delivery are follow-up work.

## Service ownership

- `LikesService` owns like reads, detail caching, transactional create/delete behavior, ownership checks, Prisma error mapping, post cache invalidation, and post-liked notification triggering.

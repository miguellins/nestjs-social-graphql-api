# Blocks Module

The blocks module owns authenticated user block and unblock workflows plus the current user's blocked-user list.

## What this module covers

- block another user
- unblock another user
- list users blocked by the current user
- remove existing follows and follow requests between blocked users
- invalidate affected user, follow, and visibility caches

## GraphQL Surface

Authenticated operations:

- `blockUser`
- `unblockUser`
- `myBlockedUsers`

## Important behavior

- users cannot block or unblock themselves
- blocking requires the target user to exist
- blocking is idempotent through an upsert
- blocking removes follows in both directions
- blocking removes pending follow requests in both directions
- unblock deletes only the current user's block edge for the target user
- blocked-user reads use cursor pagination and safe user projections

## Caching and Side Effects

After a block write, cache invalidation is best-effort and targeted:

- affected `follow:detail:{id}` keys are deleted
- `v:follows:list` is bumped when follow rows were removed
- affected user safe-detail keys are deleted
- related post/user list versions are bumped when visibility can change

The block row and relationship cleanup are correctness-critical. Cache invalidation is post-write follow-up work.

## Service ownership

- `BlocksService` owns block writes, unblock writes, blocked-user reads, follow cleanup, follow-request cleanup, pagination, and targeted cache invalidation.

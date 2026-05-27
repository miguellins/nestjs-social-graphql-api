# Mutes Module

The mutes module owns authenticated user mute relationships, scoped mute behavior, muted-user reads, and feed-hide follow-up work.

## What this module covers

- mute another user
- update mute scopes
- unmute another user
- list the current user's muted users
- check whether a user is muted globally or for one scope
- enqueue home-feed relationship hiding when `FEED` mute scope becomes active

## GraphQL Surface

Authenticated operations:

- `muteUser`
- `updateMuteScopes`
- `unmuteUser`
- `myMutedUsers`
- `isMuted`

## Important behavior

- the module is hidden behind `MUTES_ENABLED`
- scope handling is hidden behind `MUTE_SCOPES_ENABLED`
- disabled APIs return a generic not-found response
- users cannot mute themselves
- targets must exist
- mute writes reject existing block relationships
- mute list reads are cursor-paginated and return safe muted-user projections
- `isMuted` supports all-scope and single-scope checks

## Caching and Side Effects

Mute writes invalidate only affected mute, user, post, and feed cache paths. When a `FEED` mute becomes newly active, the service can enqueue a home-feed relationship-hide outbox event.

The mute row write is correctness-critical. Cache invalidation and feed cleanup enqueueing are follow-up work.

## Configuration

- `MUTES_ENABLED`
- `MUTE_SCOPES_ENABLED`
- `FEED_PROJECTION_ENQUEUE_ENABLED`

## Service ownership

- `MutesService` owns feature-flag checks, mute writes, scope normalization, muted-user pagination, scope checks, targeted cache invalidation, and feed-hide enqueueing.

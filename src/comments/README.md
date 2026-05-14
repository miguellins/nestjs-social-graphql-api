# Comments Module

The comments module owns top-level comments, one-level replies, comment thread reads, owner edits/deletes, and moderator comment removal.

## What this module covers

- top-level comments on posts
- direct replies to top-level comments only
- inline reply reads
- reply counters
- owner update and delete flows
- moderator removal flow
- mention syncing after writes
- reply notifications

## Important behavior

- `commentsByPost` paginates only top-level comments
- replies never appear as root items
- replies are returned inline with a bounded cap
- replies count toward the parent post `commentsCount`
- replies can only target top-level comments
- self-reply notifications are suppressed
- blocked-pair reply notifications are suppressed
- when outbox-backed reply delivery is enabled, the notification row and outbox row are persisted transactionally

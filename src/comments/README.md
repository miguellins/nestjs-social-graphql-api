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


## Service ownership

- `CommentsService` is the resolver-facing facade for create, read, update, delete, and moderator removal delegation.
- `CommentsReadService` owns post comment reads, threaded reply shaping, readable-post checks, visibility checks, and comment read projection.
- `CommentWriteService` owns create, update, delete, comment counter transactions, reply validation, mention sync, reply notification/outbox behavior, and write-side cache invalidation.
- `CommentModerationService` owns moderator comment removal, moderator role checks, linked-report actioning, moderation action persistence, counter decrement, and moderation cache invalidation.

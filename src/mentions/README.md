# Mentions Module

The mentions module owns durable post/comment mention reconciliation and mention notification triggering for post and comment writes.

## What this module covers

- validate mention syntax before post writes
- validate mention syntax before comment writes
- resolve mentioned active users by username
- sync durable `PostMention` rows
- sync durable `CommentMention` rows
- notify newly mentioned visible recipients

## GraphQL Surface

This module does not expose resolver operations directly.

It is used by post and comment write services during create/update flows.

## Important behavior

- mention parsing preserves unique normalized usernames from authored text
- only active users can be resolved as mention recipients
- existing mention rows are reconciled instead of blindly duplicated
- only newly added recipients are notified
- self-mentions are not notified
- recipients must be able to see the post/comment context before notification
- private-account and block visibility rules are respected before delivery

## Side Effects

Mention notification delivery is a follow-up side effect after durable mention reconciliation. Post and comment write services remain responsible for their source-of-truth writes.

## Service ownership

- `MentionsService` owns mention validation, recipient resolution, durable mention row reconciliation, visibility filtering, and post/comment mention notification triggering.

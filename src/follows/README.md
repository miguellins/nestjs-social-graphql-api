# Follows Module

This module now supports two follow paths:

- Public target account: the follow is created immediately.
- Private target account: a pending follow request is created instead of a follow.

## Implemented Behavior

### `followUser`

When `followUser(currentUserId, followingId)` runs:

- Rejects self-follow.
- Rejects blocked relationships in either direction.
- Rejects duplicate existing follows.
- If the target user is `PRIVATE`, it creates or reopens a `FollowRequest` with status `PENDING`.
- If the target user is `PUBLIC`, it creates the `Follow` directly.
- If the target user is `PRIVATE`, a `FOLLOW_REQUESTED` notification is created for the target user.
- If a previously `REJECTED` or `CANCELED` request is reopened to `PENDING`, a new `FOLLOW_REQUESTED` notification is created.
- If the request is already `PENDING`, no additional notification is created.

Important nuance:

- The decision is based on the target user's `privacySetting`.
- It does not matter whether the target already follows the requester.
- If the target is private, approval is still required.
- Public follows keep their existing `USER_FOLLOWED` notification behavior.

### Pending Request Views

The pending-request review flow is implemented as:

- `myIncomingFollowRequests`
  The target user lists pending requests they have received.

- `myOutgoingFollowRequests`
  The requester lists pending requests they have sent.

This matches the intended plan:

- The target user reviews pending requests with `myIncomingFollowRequests`.
- The requester reviews their pending requests with `myOutgoingFollowRequests`.

### Request Actions

The authenticated target/requester can then act on those pending requests:

- `approveFollowRequest`
  Only the target user can approve.
  Approval creates the actual `Follow`.

- `rejectFollowRequest`
  Only the target user can reject.

- `cancelFollowRequest`
  Only the requester can cancel.

All three actions require the request to still be `PENDING`.

## GraphQL Surface

Public reads:

- `follows`
- `followById`

Authenticated follow actions:

- `followUser`
- `myIncomingFollowRequests`
- `myOutgoingFollowRequests`
- `approveFollowRequest`
- `rejectFollowRequest`
- `cancelFollowRequest`
- `deleteFollow`

## Caching and Side Effects

After successful follow creation, approval, or deletion, the service invalidates only affected cache paths:

- bumps `v:follows:list`
- bumps related user/post visibility versions when needed
- deletes affected `user:safe:{id}` keys
- deletes `follow:detail:{id}` on follow deletion

Notification delivery and cache invalidation are best-effort follow-up work.
They should not turn a successful committed write into a failed mutation response.

For private follow requests:

- when `OUTBOX_FOLLOW_REQUESTED_ENABLED=true`, the follow request row, notification row, and outbox row are persisted in one transaction
- when `OUTBOX_FOLLOW_REQUESTED_ENABLED=false`, the service falls back to direct best-effort notification publishing
- approval, rejection, and cancelation do not create follow-request notifications

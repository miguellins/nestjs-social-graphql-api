# Notifications Module

The notifications module owns notification persistence, read-status flows, realtime delivery, and translation of feature events into notification writes.

## What this module covers

- persisted in-app notification records
- unread counts
- read and unread filtering
- mark-one and mark-all read flows
- recipient-scoped GraphQL subscription delivery
- trigger helpers used by other modules
- outbox-backed durable reply-notification delivery
- outbox-backed durable follow-request notification delivery
- user-level in-app notification preferences for replies, follow requests, mentions, post likes, and new followers

## Important behavior

- notifications are persisted before realtime delivery
- self-notifications are suppressed
- blocked-pair notifications are suppressed
- `COMMENT_REPLIED` notifications can be delivered through the outbox-backed worker path
- `FOLLOW_REQUESTED` notifications can be delivered through the outbox-backed worker path
- list reads and unread counts work from persisted state, not from subscription delivery
- follow-request notifications use the `followRequest.id` as `entityId`
- resolved follow requests leave old `FOLLOW_REQUESTED` notifications in history in v1
- preferences gate new notification persistence only; disabling a category does not hide or delete existing rows
- preference suppression increments `notification_suppressed_total{reason="prefs"}` for aggregate observability

## GraphQL Surface

Authenticated operations:

- `myNotifications`
- `unreadNotificationsCount`
- `myNotificationPreferences`
- `myInteractionPreferences`
- `updateNotificationPreferences`
- `silenceNotificationsFromActor`
- `unsilenceNotificationsFromActor`
- `mySilencedNotificationActors`
- `markNotificationAsRead`
- `markAllNotificationsAsRead`
- `notificationReceived`

## Actor Silencing

Actor silencing suppresses future notifications from a chosen actor without deleting existing notifications. `myInteractionPreferences` returns notification preferences, muted users, and silenced actors together for client settings screens.

## Preference mapping

| NotificationType | Preference field |
| --- | --- |
| `COMMENT_REPLIED` | `replyNotificationsEnabled` |
| `FOLLOW_REQUESTED` | `followRequestNotificationsEnabled` |
| `POST_MENTIONED` | `mentionNotificationsEnabled` |
| `COMMENT_MENTIONED` | `mentionNotificationsEnabled` |
| `POST_LIKED` | `postLikedNotificationsEnabled` |
| `USER_FOLLOWED` | `userFollowedNotificationsEnabled` |

Preference reads use the `user:notificationPrefs:${userId}` cache key. Updates are partial patches, reject empty input, upsert the current user's row, and invalidate that detail key best-effort.

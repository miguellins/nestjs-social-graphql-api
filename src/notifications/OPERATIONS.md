# Notifications Operations

This document explains the GraphQL operations currently exposed by the `notifications` module.

## Access model

All notification operations are authenticated-only.

## `myNotifications`
```graphql
query MyNotifications($first: Int, $after: String, $orderBy: ChronologicalOrder, $status: NotificationReadStatus) {
  myNotifications(first: $first, after: $after, orderBy: $orderBy, status: $status) {
    items {
      id
      type
      title
      body
      readAt
      readAtFormatted
      entityId
      actorId
      recipientId
      isRead
      actor {
        id
        name
        username
      }
      createdAt
      createdAtFormatted
      updatedAt
      updatedAtFormatted
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}
```

```json
{
  "status": "UNREAD",
  "first": 10
}
```

## `unreadNotificationsCount`
```graphql
query UnreadNotificationsCount {
  unreadNotificationsCount
}
```

```json
{}
```

## `markNotificationAsRead`
```graphql
mutation MarkNotificationAsRead($notificationId: Int!) {
  markNotificationAsRead(notificationId: $notificationId) {
    message
  }
}
```

```json
{
  "notificationId": 3
}
```

## `markAllNotificationsAsRead`
```graphql
mutation MarkAllNotificationsAsRead {
  markAllNotificationsAsRead {
    message
  }
}
```

```json
{}
```

## `myNotificationPreferences`
```graphql
query MyNotificationPreferences {
  myNotificationPreferences {
    replyNotificationsEnabled
    followRequestNotificationsEnabled
    mentionNotificationsEnabled
    postLikedNotificationsEnabled
    userFollowedNotificationsEnabled
  }
}
```

```json
{}
```

## `updateNotificationPreferences`
```graphql
mutation UpdateNotificationPreferences($input: UpdateNotificationPreferencesInput!) {
  updateNotificationPreferences(input: $input) {
    replyNotificationsEnabled
    followRequestNotificationsEnabled
    mentionNotificationsEnabled
    postLikedNotificationsEnabled
    userFollowedNotificationsEnabled
  }
}
```

```json
{
  "input": {
    "postLikedNotificationsEnabled": false,
    "userFollowedNotificationsEnabled": true
  }
}
```

## `notificationReceived`
```graphql
subscription NotificationReceived {
  notificationReceived {
    id
    type
    title
    body
    entityId
    actorId
    recipientId
    createdAt
  }
}
```

```json
{}
```

Important behavior:

- the websocket handshake requires `Authorization: Bearer <token>` in `connectionParams`
- for outbox-backed reply notifications, the event is delivered after worker processing, not directly from the reply mutation
- for outbox-backed follow-request notifications, the event is delivered after worker processing, not directly from the `followUser` mutation
- `FOLLOW_REQUESTED` notifications use the `followRequest.id` as `entityId`
- in v1, old `FOLLOW_REQUESTED` notifications remain in history even after approval, rejection, or cancelation
- notification preference updates are partial patches, but empty patches are rejected
- notification suppression order is block, `NOTIFICATIONS` mute, actor silence, then global preferences
- relationship mutes with `NOTIFICATIONS` suppress new notifications, filter `myNotifications`, and exclude muted actors from `unreadNotificationsCount`
- actor silence suppresses new notifications only; it does not hide existing rows from `myNotifications`
- notification suppressions increment `notification_suppressed_total` with `reason="mute"`, `reason="actor"`, or `reason="prefs"`
- actor-silence APIs require `MUTES_ENABLED=true` and `NOTIFICATION_ACTOR_SILENCE_ENABLED=true`; otherwise they return `Not found`

## `silenceNotificationsFromActor`
```graphql
mutation SilenceNotificationsFromActor($actorId: Int!) {
  silenceNotificationsFromActor(actorId: $actorId) {
    id
    actorId
    notificationsEnabled
    actor {
      id
      username
    }
    createdAt
  }
}
```

```json
{
  "actorId": 2
}
```

## `unsilenceNotificationsFromActor`
```graphql
mutation UnsilenceNotificationsFromActor($actorId: Int!) {
  unsilenceNotificationsFromActor(actorId: $actorId)
}
```

```json
{
  "actorId": 2
}
```

## `mySilencedNotificationActors`
```graphql
query MySilencedNotificationActors($first: Int, $after: String) {
  mySilencedNotificationActors(first: $first, after: $after) {
    items {
      id
      actorId
      notificationsEnabled
      actor {
        id
        username
      }
      createdAt
    }
    pageInfo {
      endCursor
      hasNextPage
    }
  }
}
```

```json
{
  "first": 10
}
```

## `myInteractionPreferences`
```graphql
query MyInteractionPreferences($mutedFirst: Int, $silencedFirst: Int) {
  myInteractionPreferences(mutedFirst: $mutedFirst, silencedFirst: $silencedFirst) {
    notificationPreferences {
      replyNotificationsEnabled
      followRequestNotificationsEnabled
      mentionNotificationsEnabled
      postLikedNotificationsEnabled
      userFollowedNotificationsEnabled
    }
    mutedUsers {
      items {
        mutedUserId
        scopes
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
    silencedActors {
      items {
        actorId
        notificationsEnabled
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
}
```

```json
{
  "mutedFirst": 10,
  "silencedFirst": 10
}
```

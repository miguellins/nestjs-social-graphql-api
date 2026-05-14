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
- preference suppressions block new persistence and increment `notification_suppressed_total{reason="prefs"}`

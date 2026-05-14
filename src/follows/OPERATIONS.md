# Follow Operations

This document explains the GraphQL operations currently exposed by the `follows` module.

## Public reads

### `follows`
```graphql
query Follows($first: Int, $after: String, $orderBy: ChronologicalOrder, $followerId: Int, $followingId: Int) {
  follows(first: $first, after: $after, orderBy: $orderBy, followerId: $followerId, followingId: $followingId) {
    items {
      id
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
  "followingId": 2,
  "first": 10
}
```

### `followById`
```graphql
query FollowById($id: Int!) {
  followById(id: $id) {
    id
  }
}
```

```json
{
  "id": 1
}
```

## Authenticated flow

### `followUser`
```graphql
mutation FollowUser($userId: Int!) {
  followUser(userId: $userId) {
    status
    followId
    followRequestId
    message
  }
}
```

```json
{
  "userId": 2
}
```

Important behavior:

- if the target account is `PUBLIC`, the mutation creates the follow immediately
- if the target account is `PRIVATE`, the mutation creates or reopens a `PENDING` follow request
- a newly created or reopened private follow request creates a `FOLLOW_REQUESTED` notification for the target user
- if the request is already `PENDING`, the mutation rejects the duplicate request and does not create another notification
- public follows keep the existing `USER_FOLLOWED` notification behavior

### `myIncomingFollowRequests`
```graphql
query MyIncomingFollowRequests($first: Int, $after: String) {
  myIncomingFollowRequests(first: $first, after: $after) {
    items {
      id
      status
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

### `myOutgoingFollowRequests`
```graphql
query MyOutgoingFollowRequests($first: Int, $after: String) {
  myOutgoingFollowRequests(first: $first, after: $after) {
    items {
      id
      status
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

### `approveFollowRequest`
```graphql
mutation ApproveFollowRequest($requestId: Int!) {
  approveFollowRequest(requestId: $requestId) {
    id
    status
  }
}
```

```json
{
  "requestId": 5
}
```

Important behavior:

- approval creates the real `Follow`
- approval does not create a `FOLLOW_REQUESTED` notification

### `rejectFollowRequest`
```graphql
mutation RejectFollowRequest($requestId: Int!) {
  rejectFollowRequest(requestId: $requestId) {
    id
    status
  }
}
```

```json
{
  "requestId": 5
}
```

Important behavior:

- rejection changes the request state only
- rejection does not create a notification

### `cancelFollowRequest`
```graphql
mutation CancelFollowRequest($requestId: Int!) {
  cancelFollowRequest(requestId: $requestId) {
    id
    status
  }
}
```

```json
{
  "requestId": 5
}
```

Important behavior:

- cancelation changes the request state only
- cancelation does not create a notification

### `deleteFollow`
```graphql
mutation DeleteFollow($id: Int!) {
  deleteFollow(id: $id) {
    message
  }
}
```

```json
{
  "id": 3
}
```

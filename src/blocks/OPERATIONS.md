# Blocks Operations

This document explains the GraphQL operations currently exposed by the `blocks` module.

## Access model

All block operations are authenticated-only.

## `blockUser`
```graphql
mutation BlockUser($input: BlockUserInput!) {
  blockUser(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "targetUserId": 7
  }
}
```

Important behavior:

- cannot block yourself
- repeated block requests are idempotent
- removes follow relationships in both directions
- clears related visibility-sensitive caches

## `unblockUser`
```graphql
mutation UnblockUser($input: UnblockUserInput!) {
  unblockUser(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "targetUserId": 7
  }
}
```

## `myBlockedUsers`
```graphql
query MyBlockedUsers($first: Int, $after: String) {
  myBlockedUsers(first: $first, after: $after) {
    items {
      id
      username
      name
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

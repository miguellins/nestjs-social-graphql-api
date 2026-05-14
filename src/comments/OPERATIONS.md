# Comments Operations

This document explains the GraphQL operations currently exposed by the `comments` module.

## Access model

All comment operations are authenticated-only.

## `createComment`
```graphql
mutation CreateComment($input: CreateCommentInput!) {
  createComment(input: $input) {
    id
    content
    postId
    parentCommentId
    repliesCount
    replies {
      id
      parentCommentId
    }
  }
}
```

Top-level example:

```json
{
  "input": {
    "postId": 3,
    "content": "Top-level comment"
  }
}
```

Reply example:

```json
{
  "input": {
    "postId": 3,
    "parentCommentId": 43,
    "content": "Direct reply"
  }
}
```

Important behavior:

- missing parent comments are rejected
- replies to removed parents are rejected
- parent comment must belong to the same post
- replies can only target top-level comments
- when reply delivery outbox mode is enabled, reply notifications are persisted first and delivered asynchronously

## `commentsByPost`
```graphql
query CommentsByPost($postId: Int!, $first: Int, $after: String, $orderBy: ChronologicalOrder) {
  commentsByPost(postId: $postId, first: $first, after: $after, orderBy: $orderBy) {
    items {
      id
      parentCommentId
      repliesCount
      replies {
        id
        parentCommentId
      }
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
  "postId": 3,
  "first": 10
}
```

## `updateComment`
```graphql
mutation UpdateComment($commentId: Int!, $input: UpdateCommentInput!) {
  updateComment(commentId: $commentId, input: $input) {
    id
    content
    updatedAt
  }
}
```

```json
{
  "commentId": 43,
  "input": {
    "content": "Updated text"
  }
}
```

## `deleteComment`
```graphql
mutation DeleteComment($commentId: Int!) {
  deleteComment(commentId: $commentId) {
    message
  }
}
```

```json
{
  "commentId": 43
}
```

## `removeCommentByModerator`
```graphql
mutation RemoveCommentByModerator($input: RemoveCommentByModeratorInput!) {
  removeCommentByModerator(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "commentId": 43,
    "reason": "Spam"
  }
}
```

# Media Operations

This document explains the GraphQL operations currently exposed by the `media` module.

## Access model

All media operations are authenticated-only.

## `requestPostMediaUpload`
```graphql
mutation RequestPostMediaUpload($input: RequestPostMediaUploadInput!) {
  requestPostMediaUpload(input: $input) {
    mediaId
    url
    uploadUrl
    expiresAt
  }
}
```

```json
{
  "input": {
    "postId": 1,
    "mimeType": "image/jpeg",
    "originalFileName": "cover.jpg"
  }
}
```

## `completePostMediaUpload`
```graphql
mutation CompletePostMediaUpload($input: CompletePostMediaUploadInput!) {
  completePostMediaUpload(input: $input) {
    id
    status
    url
    postId
  }
}
```

```json
{
  "input": {
    "mediaId": 10
  }
}
```

## `attachMediaToPost`
```graphql
mutation AttachMediaToPost($input: AttachMediaToPostInput!) {
  attachMediaToPost(input: $input) {
    post {
      id
      mediaAttachments {
        id
        sortOrder
      }
    }
  }
}
```

```json
{
  "input": {
    "postId": 1,
    "mediaId": 10
  }
}
```

## `myMedia`
```graphql
query MyMedia($first: Int, $after: String, $orderBy: ChronologicalOrder) {
  myMedia(first: $first, after: $after, orderBy: $orderBy) {
    items {
      id
      status
      url
      postId
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

## `mediaSignedViewUrl`
```graphql
query MediaSignedViewUrl($mediaId: Int!) {
  mediaSignedViewUrl(mediaId: $mediaId) {
    url
    expiresAt
  }
}
```

```json
{
  "mediaId": 10
}
```

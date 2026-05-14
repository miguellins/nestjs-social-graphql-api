# Reports Operations
This document explains the GraphQL operations currently exposed by the `reports` module.

## Access model
Authenticated users:
- `reportPost`
- `reportComment`

Moderators and admins:
- `reviewReports`
- `dismissReport`
- `actionReport`

## `reportPost`
```graphql
mutation ReportPost($input: ReportPostInput!) {
  reportPost(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "postId": 123,
    "reason": "SPAM",
    "details": "Repeated scam links"
  }
}
```

## `reportComment`
```graphql
mutation ReportComment($input: ReportCommentInput!) {
  reportComment(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "commentId": 456,
    "reason": "HARASSMENT",
    "details": "Targeted abusive language"
  }
}
```

## `reviewReports`
```graphql
query ReviewReports($first: Int, $after: String, $orderBy: ChronologicalOrder, $status: ReportStatus, $targetType: ReportTargetType) {
  reviewReports(first: $first, after: $after, orderBy: $orderBy, status: $status, targetType: $targetType) {
    items {
      id
      status
      targetType
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
  "status": "OPEN",
  "first": 20
}
```

## `dismissReport`
```graphql
mutation DismissReport($reportId: Int!) {
  dismissReport(reportId: $reportId) {
    message
  }
}
```

```json
{
  "reportId": 9
}
```

## `actionReport`
```graphql
mutation ActionReport($reportId: Int!) {
  actionReport(reportId: $reportId) {
    message
  }
}
```

```json
{
  "reportId": 9
}
```

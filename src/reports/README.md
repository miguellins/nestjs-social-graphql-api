# Reports Module

The reports module owns user-submitted content reporting and moderator review actions for posts and comments.

## What this module covers

- report a post
- report a comment
- moderator review queue reads
- dismiss a report
- mark a report as actioned
- link moderator removals to open reports

## Important behavior

- reports target posts or comments
- duplicate open reports by the same user on the same target are rejected
- users cannot report their own content
- moderator review does not itself remove content
- linked moderator removals can transition matching open reports to `ACTIONED`


## GraphQL Surface

Authenticated user operations:

- `reportPost`
- `reportComment`

Moderator/admin operations:

- `reviewReports`
- `dismissReport`
- `actionReport`

## Access and Side Effects

- report submission requires an authenticated active user
- review and report actions require moderator or admin roles
- report review actions update report state only
- content removal is performed by the posts/comments moderation flows and can link open reports to `ACTIONED`

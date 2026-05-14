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

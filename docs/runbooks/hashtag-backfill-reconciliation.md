# Hashtag Backfill Reconciliation Runbook

This runbook covers local/demo operation for reconciling historical post hashtag joins and public hashtag counters.

## Scope note

This job has no GraphQL surface and no app-level operator user. Run it only from a secure operator environment with the same database and cache credentials used for maintenance tasks.

The job is idempotent and supports canary ranges with `--after-id`, `--limit`, and `--chunk-size`. Dry-run is the default. Writes require `--apply`.

## Build

```bash
npm run build
```

## Phase 1: observe join drift

```bash
npm run hashtag:reconcile -- --mode observe-joins --after-id 0 --limit 500 --log-format json
```

Review `join_drift_observed` records. Invalid historical post content is reported as `classification="skipped_invalid_content"` with a redacted reason such as `reserved`, `charset`, `length`, `too_many_unique`, or `unknown`. Raw post content is not logged.

## Phase 2: repair join drift

Dry-run first:

```bash
npm run hashtag:reconcile -- --mode repair-joins --after-id 0 --limit 500 --log-format json
```

Apply only after reviewing the dry-run output:

```bash
npm run hashtag:reconcile -- --mode repair-joins --after-id 0 --limit 500 --apply --log-format json
```

The repair phase processes posts sequentially by `id`, uses the shared hashtag replacement service in one transaction per post, skips invalid historical content, and bumps `v:hashtags:list` plus `v:posts:list` after write chunks and once at completion.

## Phase 3: observe count drift

```bash
npm run hashtag:reconcile -- --mode observe-counts --after-id 0 --limit 500 --log-format json
```

Review `count_drift_observed` records. The aggregate truth counts join rows whose post is not removed and whose author is public and not deactivated.

## Phase 4: repair count drift

Dry-run first:

```bash
npm run hashtag:reconcile -- --mode repair-counts --after-id 0 --limit 500 --log-format json
```

Apply only after reviewing the dry-run output:

```bash
npm run hashtag:reconcile -- --mode repair-counts --after-id 0 --limit 500 --apply --log-format json
```

The repair phase sets each drifted `Hashtag.postsCount` to the aggregate truth and bumps `v:hashtags:list` plus `v:posts:list` after write chunks and once at completion.

## Post-verify

Re-run the observe phases for the same canary range:

```bash
npm run hashtag:reconcile -- --mode observe-joins --after-id 0 --limit 500 --log-format json
npm run hashtag:reconcile -- --mode observe-counts --after-id 0 --limit 500 --log-format json
```

Expected result: zero join drift and zero count drift, except posts intentionally skipped for invalid historical content.

Use normal API checks for a few known tags:

```graphql
query SearchHashtags($q: String!) {
  searchHashtags(q: $q) {
    slug
    postsCount
  }
}
```

```graphql
query PostsByHashtag($hashtag: String!) {
  postsByHashtag(hashtag: $hashtag, first: 10) {
    nodes {
      id
      content
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
```

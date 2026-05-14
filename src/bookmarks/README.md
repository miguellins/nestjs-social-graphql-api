# Bookmarks Module
This module lets an authenticated user save visible posts to a personal bookmarks list.

## Overview
The bookmarks feature is intentionally simple:
1. a user bookmarks a post they are currently allowed to see
2. the bookmark stores the saved post relation
3. the user can later list their own bookmarks
4. the user can remove a bookmark at any time

Important current behavior:
- bookmarks are private to the authenticated user
- a user can bookmark the same post only once
- bookmark reads are visibility-aware
- if a bookmarked post later becomes invisible, it is excluded from `myBookmarks`

## Visibility Rules
`myBookmarks` does not blindly return all saved rows.
It only returns bookmarks whose posts are still visible to the current user.

A bookmarked post is excluded when any of the following applies:
- the post was removed
- the author is `DEACTIVATED`
- a block relationship exists in either direction between viewer and author
- the author is private and the current user no longer satisfies the post visibility rules

This means a bookmark can still exist in the database while disappearing from the GraphQL list because the post is no longer visible.

## Access Rules
All bookmark operations are authenticated-only.

The current user must be `ACTIVE`.

If the current user is:
- `SUSPENDED`, bookmark operations are rejected
- `DEACTIVATED`, bookmark operations are rejected

## GraphQL Surface
The module currently exposes three authenticated operations:

- `myBookmarks`
- `bookmarkPost`
- `removeBookmark`

## 1. `bookmarkPost`
Use this mutation to save a currently visible post to the authenticated user's bookmarks.

### Behavior
- verifies the current user is active
- verifies the target post is currently visible to that user
- creates the bookmark row
- rejects duplicates
- bumps only the current user's bookmark-list cache version

### Common Failure Cases
- the post does not exist
- the post is not visible to the current user
- the user already bookmarked the post
- the current user account is suspended or deactivated

## 2. `myBookmarks`
Use this query to list the authenticated user's bookmarks with cursor pagination.

### Behavior
- verifies the current user is active
- returns a cursor-paginated bookmarks page
- applies the same viewer-aware visibility rules used for post access
- excludes bookmarked posts that are no longer visible
- uses versioned per-user caching

### Pagination
`myBookmarks` uses the shared chronological cursor pagination contract:
- `first`
- `after`
- `orderBy`

The result includes:
- `items`
- `pageInfo.endCursor`
- `pageInfo.hasNextPage`

## 3. `removeBookmark`
Use this mutation to remove a bookmarked post from the authenticated user's saved list.

### Behavior
- verifies the current user is active
- removes the bookmark for `(currentUserId, postId)`
- returns an idempotent success message even if no bookmark existed
- bumps only the current user's bookmark-list cache version when a row was actually removed

## Caching
The bookmarks module uses per-user versioned list caching.

Current pattern:
- list version key: `v:user:{userId}:bookmarks:list`
- list cache key: `user:{userId}:bookmarks:list:v{version}:...`

After a successful bookmark create or delete:

- only the authenticated user's bookmark list version is bumped

This keeps invalidation narrow and avoids unrelated cache churn.

## Practical Usage Notes
- bookmark a post only after confirming the viewer can read it
- when testing visibility regressions, always verify `myBookmarks` both before and after the visibility change
- if a bookmarked post disappears from `myBookmarks`, first check:
  - post removal
  - author deactivation
  - block relationship
  - private-account visibility changes

## Current Limits
The feature is intentionally narrow in v1.

It does not currently support:
- bookmark folders or collections
- bookmark labels or notes
- bulk bookmark actions
- public/shared bookmark lists
- bookmark search

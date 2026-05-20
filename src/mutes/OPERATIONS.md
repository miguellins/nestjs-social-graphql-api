# Mutes operations

## Feature flags

- `MUTES_ENABLED=false` hides all mute GraphQL APIs with `Not found` and makes service visibility helpers return no muted users.
- `MUTE_SCOPES_ENABLED=false` keeps rollback-compatible behavior: every mute row is treated as active for `FEED`, `POSTS`, `COMMENTS`, and `NOTIFICATIONS`, even if partial scopes are stored.

## Scoped mute behavior

- `muteUser` creates a mute relationship or replaces the existing scope set.
- Omitting `scopes` defaults to all scopes.
- `updateMuteScopes` replaces scopes on an existing mute only; use `muteUser` to create a new row.
- `unmuteUser` deletes the row and does not restore projected home feed entries.
- Invalid stored scope JSON fails closed as a full mute.

## Scope surfaces

- `FEED`: home feed and home feed projection reads.
- `POSTS`: post lists, post detail, bookmarks, hashtag post pages, username timelines, and post search. Public post and hashtag reads only apply `POSTS` mute filtering when the request includes a valid `Authorization: Bearer <token>`; anonymous requests keep guest visibility.
- `COMMENTS`: comment and reply lists.
- `NOTIFICATIONS`: notification persistence, realtime publish re-checks, `myNotifications` filtering, and `unreadNotificationsCount` badge counts.

## Outbox

`feed.home.relationship.hide` is enqueued only when `FEED` becomes newly active for a relationship. Notification-only mutes do not enqueue feed cleanup.

# Media Module

The media module owns post-scoped upload orchestration, profile-avatar upload orchestration, upload verification, media attachment, owner-only media reads, and media read projection.

## What this module covers

- reserve a direct upload URL
- verify uploaded storage objects
- reserve and complete profile avatar uploads
- attach verified media to posts
- list the current user's media
- generate signed view URLs for owned media

## Important behavior

- post media uploads are post-scoped
- profile avatar uploads use `PROFILE_AVATAR`, are image-only, require square
  dimensions, and use a smaller byte limit than post images
- media ownership is enforced
- a media item must be `READY` before it can be attached or viewed through a signed URL
- media can only be attached to the same post it was uploaded for
- completed avatars set `User.avatarMediaId`, invalidate user profile/list
  caches, and best-effort delete the previous ready avatar row and object
- when R2 media storage is not configured, text profile APIs still work and
  avatar upload mutations return a clear unavailable error
- attachment ordering is handled inside the module

## GraphQL Surface

Authenticated operations:

- `requestPostMediaUpload`
- `completePostMediaUpload`
- `requestProfileAvatarUpload`
- `completeProfileAvatarUpload`
- `attachMediaToPost`
- `myMedia`
- `mediaSignedViewUrl`

## Current doc set

- `OPERATIONS.md`
  caller-facing GraphQL media flow
- `ARCHITECTURE.md`
  internal service split and responsibilities

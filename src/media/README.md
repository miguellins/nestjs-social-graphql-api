# Media Module

The media module owns post-scoped upload orchestration, upload verification, media attachment, owner-only media reads, and media read projection.

## What this module covers

- reserve a direct upload URL
- verify uploaded storage objects
- attach verified media to posts
- list the current user's media
- generate signed view URLs for owned media

## Important behavior

- media uploads are post-scoped
- media ownership is enforced
- a media item must be `READY` before it can be attached or viewed through a signed URL
- media can only be attached to the same post it was uploaded for
- attachment ordering is handled inside the module

## Current doc set

- `OPERATIONS.md`
  caller-facing GraphQL media flow
- `ARCHITECTURE.md`
  internal service split and responsibilities

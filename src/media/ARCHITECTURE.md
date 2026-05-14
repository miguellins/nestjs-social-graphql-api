# Media Module Internal Pattern

This note records the current internal shape of the `media` module after the
first calm architecture extractions.

It does not change the public module boundary.

## Current Internal Shape

The module now has three distinct internal roles:

1. `media.service.ts`
- public orchestration entrypoints used by the resolver
- upload lifecycle coordination
- attachment write orchestration
- service-layer parsing
- persistence failure mapping

2. `media-query.service.ts`
- bounded paginated media reads through `myMedia(...)`
- post readback for `attachMediaToPost(...)` through `getAttachMediaPostResult(...)`
- read-side projection coordination with `MediaReadProjectionService`

3. `media-policy.service.ts`
- `assertPostOwnership(...)`
- `getOwnedMediaById(...)`
- `assertPostMediaConstraints(...)`

Supporting collaborators already present:
- `media-read-projection.service.ts`
- `media-validation.service.ts`
- `storage/r2-storage.service.ts`

## Normalized Pattern For This Module

The `media` module now follows this internal structure:

- `media.service.ts`
  - stays as the feature orchestration service
  - owns write-flow sequencing, transactions, best-effort follow-up work, and
    sanitized persistence failure handling

- `media-query.service.ts`
  - owns read/query paths that are safe to isolate
  - can use Prisma directly for explicit feature-local reads

- `media-policy.service.ts`
  - owns ownership checks and module-specific attachment constraints
  - keeps rule/query logic out of the main orchestration service

- helper services that support both read and write flows
  - `MediaReadProjectionService`
  - `MediaValidationService`
  - `R2StorageService`

## What Stays In `media.service.ts`

Keep these responsibilities in `media.service.ts` unless they become clearly
too broad:

- `requestPostMediaUpload(...)`
- `completePostMediaUpload(...)`
- `attachMediaToPost(...)`
- `createMediaSignedViewUrl(...)`
- input parsing methods
- `getNextSortOrder(...)`
- `throwUnexpectedPersistenceFailure(...)`

Reason:
- these methods still coordinate correctness-critical sequencing across
  validation, policy checks, storage inspection, writes, and best-effort
  follow-up work

## What Could Be Split Later

Do not split these yet by default. Revisit only if `media.service.ts` starts to
grow again or the flows become materially more complex.

- `media-upload.service.ts`
  - candidate for `requestPostMediaUpload(...)`
  - candidate for `completePostMediaUpload(...)`

- `media-attachment.service.ts`
  - candidate for `attachMediaToPost(...)`

Possible trigger for a later split:
- more upload states
- moderation/review workflows
- transcoding or background processing
- richer attachment policies
- multiple attachment mutation variants

## Rules For Future Changes

- Keep helpers inside `src/media/`
- Do not introduce a generic repository abstraction
- Keep Prisma access explicit and feature-local
- Keep resolver behavior unchanged unless a public contract change is intended
- Keep transactions and best-effort side effects in the same correctness
  categories they use today
- Prefer one new helper with one obvious responsibility over large service
  fragmentation

## Definition Of Success

The module is in a good state when:
- `media.service.ts` is no longer the only place where every concern lives
- read/query logic and ownership/policy logic stay out of the main orchestration
  path
- each extracted helper has one obvious role
- tests remain stable and public behavior does not regress
- future extractions happen only when complexity justifies them

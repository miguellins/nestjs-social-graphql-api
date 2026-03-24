# AGENTS.md

This file defines the working rules for contributors and coding agents in this repository. Follow these rules before adding features, editing existing code, or changing architecture.

## Purpose

- Preserve the current project style and architecture.
- Keep GraphQL behavior predictable and safe.
- Prevent regressions in validation, auth, caching, and Prisma workflows.
- Prefer consistency with the existing codebase over introducing new patterns.

## Project Stack

- Framework: NestJS 11
- API style: GraphQL code-first with Apollo
- Database: Prisma + MySQL
- Cache: `@nestjs/cache-manager` + Keyv + Redis
- Validation: `class-validator` at the GraphQL DTO boundary, and `zod` for service-layer command parsing in modules that follow that pattern
- Auth: JWT with Passport, GraphQL-aware guards, public resolver opt-out via `@Public()`
- Language: TypeScript with strict-ish compiler settings and type-aware ESLint

## Non-Negotiable Rules

- Keep resolvers thin. Resolver methods should delegate business logic to services.
- Keep services responsible for domain behavior, validation parsing, authorization checks, cache invalidation, and Prisma interaction.
- Do not expose sensitive Prisma fields directly through GraphQL models. Use safe DTO/select patterns already present in the repo.
- Do not bypass validation. GraphQL inputs must use DTO classes with decorators, and service-layer commands must be parsed with the module’s Zod schema when that pattern already exists.
- Do not remove pagination caps. Always clamp `take` using `PAGINATION` constants.
- Never return unlimited rows from list-style queries.
- Do not introduce wildcard cache deletion. Use detail-key deletion plus version-key bumps for list invalidation.
- Do not leak internal error details to GraphQL clients. Throw explicit Nest exceptions or sanitized fallback errors.
- Do not put business logic in modules, decorators, or bootstrap helpers.
- Do not query Prisma with `include`/`select` shapes that expose fields not represented by the public GraphQL contract.

## File Organization Rules

- Keep feature code grouped by module under `src/<feature>/`.
- Follow the existing folder split when adding module files.
- `args/` is for GraphQL argument classes.
- `dto/` is for GraphQL inputs, output DTO helpers, and Prisma select constants.
- `models/` is for GraphQL object types when the module follows that convention.
- If a module already exposes GraphQL object types from `dto/`, preserve that module’s existing pattern instead of forcing a move to `models/`.
- `schemas/` is for Zod command schemas.
- `<feature>.service.ts` contains domain logic.
- `<feature>.resolver.ts` contains GraphQL entry points.
- `<feature>.module.ts` contains Nest module wiring.
- Keep shared infrastructure under `src/common/`, `src/bootstrap/`, `src/graphql/`, `src/cache/`, and `src/config/`.
- Use the `@/` path alias for internal imports.

## Naming Rules

- Name GraphQL object types using the module’s existing public naming convention, such as `SafeUser`, `Post`, `PostDetail`, or `NotificationDTO`.
- Name GraphQL input types with the `Input` suffix.
- Name service-layer Zod command types with the `Command` suffix.
- Name Zod schemas with clear action names like `createUserCommandSchema`.
- Name cache version keys by collection, for example `v:user:list` or `v:posts:list`.
- Name detail cache keys by entity and id, for example `user:safe:${id}` or `posts:detail:${id}`.

## Resolver Rules

- Resolvers should mostly do four things: declare GraphQL shape, attach auth metadata, attach throttling, and pass arguments to services.
- Public queries and mutations must be marked with `@Public()`.
- Apply `@Throttle()` to every applicable query and mutation using the shared categories in `THROTTLE_LIMITS`.
- Use `@CurrentUser()` to access the authenticated user instead of reading GraphQL context manually, except when implementing subscription-specific filtering.
- Prefer `@Args()` argument objects for grouped query params such as pagination and filters.
- Keep resolver return types explicit when useful for readability and consistency.

## Service Rules

- Services own domain behavior.
- Validate and normalize service inputs through the module Zod schema when the module already follows that pattern.
- Build Prisma write payloads explicitly. Do not spread unchecked user input into Prisma `data`.
- For update flows, only assign fields that are defined.
- Perform ownership checks in the service layer before protected updates/deletes.
- Translate known Prisma errors into precise Nest exceptions.
- Use `InternalServerErrorException` as a sanitized fallback for unexpected persistence failures.
- Re-throw intentional domain exceptions instead of wrapping them again.
- Do not wrap entire service methods in broad `try/catch` blocks unless needed for Prisma error mapping, external side-effect handling, or sanitized fallback errors.
- Treat the database write path as the source of truth and keep core correctness strict.
- Use transactions for operations that must succeed or fail together.
- Treat cache invalidation, subscription publish, notification delivery, analytics, and similar follow-up work as best-effort side effects only when the system remains correct if they fail after the main write commits.
- Do not make the mutation fail after a committed database write only because a non-critical post-commit side effect failed.
- If a non-critical post-commit side effect fails, prefer success plus logging over a false-negative mutation failure.
- Do not apply this rule to validation, authorization, password/security logic, required counter consistency, token invalidation, or any step that is part of the core business guarantee.

## Validation Rules

- GraphQL boundary validation belongs in DTO/input classes with `class-validator`.
- Input normalization at the DTO boundary should use existing transformers such as `@Trim()`.
- When a module uses service-level command parsing, keep its Zod schemas under `schemas/`.
- When parsing with Zod in services, use `parseWithBadRequest(...)` unless there is a deliberate reason to throw the raw Zod error.
- Keep normalization rules consistent with existing behavior.
- Trim user-entered text where appropriate.
- Lowercase canonical identifiers like usernames/emails when the feature already does so.
- Enforce password length constraints compatible with bcrypt.

## Auth and Security Rules

- The app is protected by default via the global GraphQL JWT guard. New public queries or mutations must opt out with `@Public()`.
- Do not implement ad hoc auth checks inside resolvers when the shared decorators/guards already cover the use case.
- Subscription authentication belongs in the GraphQL subscription configuration and subscription context handling, not in resolver business logic.
- Keep HTTP-level security setup centralized in bootstrap helpers like `setup-security.ts`.
- Preserve fail-fast environment validation through `src/config/env/env.schema.ts` when adding new env vars.
- For account-recovery or identity-sensitive flows such as password reset, avoid leaking whether an account exists through user-facing responses.
- Prefer generic initiation responses and secure token handling for reset or verification workflows.
- Do not log raw reset, verification, or other sensitive one-time tokens.

## GraphQL Rules

- Keep the API code-first. Add or modify GraphQL decorators on classes instead of hand-editing schema files.
- Treat `src/schema.gql` as generated output.
- Keep GraphQL errors sanitized. Do not add formatting that leaks stack traces or internal metadata.
- When adding expensive queries, respect the existing query complexity infrastructure.
- For subscriptions, ensure the published payload shape matches the resolver subscription field name.
- Keep GraphQL errors sanitized.
- When the project intentionally exposes safe machine-readable error fields such as `code` or other structured metadata, preserve them instead of reducing everything to message-only responses.
- If the current runtime still formats errors as message-only, treat structured error preservation as the preferred direction for future improvements rather than assuming it is already fully implemented everywhere.

## Prisma Rules

- Reuse the shared `PrismaService`.
- Prefer explicit `select` objects for read queries.
- Keep “safe select” constants close to DTO/model definitions, following the existing module pattern.
- Use transactions when multiple writes must stay in sync, especially when updating denormalized counters such as `likesCount` or `commentsCount`.
- Check existence and ownership explicitly when that leads to clearer domain errors.
- Translate known Prisma codes like `P2002`, `P2003`, and `P2025` into user-facing Nest exceptions.
- If a new feature adds a denormalized counter, keep increment/decrement operations transactionally consistent.
- Reuse a single shared `PrismaService` / `PrismaClient` lifecycle for the application process.
- Do not create ad hoc Prisma clients inside feature services, helpers, or request-scoped flows.
- Avoid patterns that accidentally create multiple connection pools unless there is a deliberate infrastructure reason.
- Never edit any file in `prisma/migrations/`.
- Never create new migration files.
- Never delete or rename migration files.
- Prisma-related code changes must be limited to `prisma/schema.prisma` unless the user explicitly requests migration work.
- If a change would normally require a migration, modify only `prisma/schema.prisma` and clearly state that migration generation/review is still required.

## Cache Rules

- Use `CacheHelperService` instead of calling the cache manager directly from feature services.
- Use read-through caching via `getOrSet(...)` for stable reads.
- Use detail-key deletion for single-entity invalidation.
- Use version bumps for list invalidation.
- Keep cache keys deterministic and parameter-aware.
- When a write affects related entities, invalidate related caches too.
- Invalidate only the caches actually affected by the write. Do not use broad cache invalidation when a precise detail-key delete plus version bump is enough.
- Existing example: creating a post bumps post lists and invalidates user-related cached views.
- Existing example: creating/deleting comments invalidates post detail.
- Existing example: updating/deleting a post invalidates its detail and bumps list versions.
- Do not cache values whose freshness must reflect a just-written counter unless the service explicitly overwrites or recomputes that field, as done with `viewsCount`.

## Pagination and Query Rules

- Every list-style query must clamp `take` to `PAGINATION.MAX_TAKE` or the corresponding feature-specific cap.
- Default pagination should use the shared defaults in `PAGINATION`.
- Default chronological ordering should remain newest-first unless the feature explicitly requires another default.
- Reuse `ChronologicalOrder` and `toSortDirection(...)` instead of inventing new order enums for the same concept.
- Keep list queries bounded with shared pagination caps and explicit ordering.
- When introducing or redesigning list APIs that are expected to support real multi-page frontend usage, prefer a real pagination contract such as cursor-based pagination with clear next-page semantics.
- Avoid extending `take`-only list contracts for new scalable user-facing flows when a practical multi-page contract is required.
- Treat cursor-style pagination as the preferred direction for future expansion, even if older parts of the codebase still use capped `take` plus ordering.

## DTO and Model Rules

- Keep GraphQL input classes focused on input validation and transformation.
- Keep GraphQL object models/DTOs aligned with what the API returns, not with full Prisma models.
- Never expose secrets such as password hashes.
- Prefer explicit safe DTO/select exports like `SafeUserSelect`, `SafePostListSelect`, and `NotificationSelect`.
- If a field is nullable in GraphQL, declare it intentionally with the appropriate decorator options.

## Notifications and Subscription Rules

- Do not create self-notifications for actor-recipient self actions.
- Publish subscription events only after the database write succeeds.
- If publish fails, log it without failing the write operation unless the product requirement explicitly changes.
- Subscription filtering must use the authenticated subscriber id from GraphQL context and must not trust client-supplied recipient ids.
- Use `runBestEffort` only for non-critical post-success side effects.
- Good candidates include cache invalidation, cache refresh, subscription publish, notification delivery, analytics, and similar follow-up work.
- Do not use `runBestEffort` for core database writes, required transactions, validation, auth checks, ownership checks, password logic, or any step that must fail the request if it fails.
- Before using `runBestEffort`, ask whether the system is still correct if that step fails after the database write has already succeeded.
- Treat realtime subscriptions as a delivery acceleration layer, not the source of truth.
- Persist notification/event state in the database before publishing realtime updates when the feature requires durability.
- Do not rely on in-memory pubsub as the long-term architecture for features that must work across multiple app instances.
- Prefer shared realtime transport such as Redis-backed pubsub or another broker-backed approach when the feature is intended for multi-instance deployment.

## Environment Rules

- Every new required env var must be added to `env.schema.ts`.
- Parse booleans and numeric env values explicitly through Zod helpers instead of relying on raw strings.
- Keep defaults in the schema when the application already treats the variable as optional-with-default.

## Testing Rules

- Add or update `*.spec.ts` files whenever service behavior, guards, transformers, schema parsing, or bootstrap logic changes.
- Service tests should mock `PrismaService` and other collaborators directly, matching the existing style.
- Test success paths and failure paths.
- Verify cache behavior when changing cached flows.
- Verify Prisma error mapping when changing write logic.
- Verify pagination clamping and default ordering in list services.
- Keep tests focused on behavior, not implementation trivia.

## Style Rules

- Match the current import style: external imports first, internal `@/` imports next, type-only imports where appropriate.
- Keep imports grouped, minimal, stable, and free of unused entries.
- Avoid mixing many import styles unnecessarily.
- Prefer the repository's established `@/` alias for internal imports.
- Keep comments useful and specific.
- Prefer explicit local variables for normalized values and cache keys.
- Keep functions and methods readable over overly compact.
- Stay compatible with the current TypeScript and ESLint configuration. Do not introduce patterns that fight type-aware linting without a reason.
- If the same narrow logic is repeated across multiple files, extract it into a small shared helper only when the repetition is real and the abstraction clearly improves readability, consistency, and modularity.
- Do not create shared helpers for one-off logic or vague abstractions.
- Prefer small, well-named helpers in the appropriate shared/common area over copy-pasted repeated error-handling or side-effect patterns.

## Output and Reference Formatting Rules

- When referencing project files in reviews, prompts, summaries, recommendations, reports, or change explanations, use plain filenames or short repo-relative paths only.
- Never return markdown links for project files.
- Never use this format:
  - `[posts.service.ts](/home/mlins/Desktop/nestjs_graphql/src/posts/posts.service.ts)`
  - `[name of the file](path)`
- Never return absolute local filesystem paths in outputs.
- If the filename is already clear enough, return only the plain filename.
- If extra context is needed, return a short repo-relative path in plain text, not as a markdown link.
- Good examples:
  - `posts.service.ts`
  - `users.service.ts`
  - `graphql.config.ts`
  - `src/posts/posts.service.ts`
- Bad examples:
  - `[posts.service.ts](/home/mlins/Desktop/nestjs_graphql/src/posts/posts.service.ts)`
  - `[users.service.ts](src/users/users.service.ts)`
  - `[name of the file](path)`
- Do not add redundant path formatting when the file name is already being returned clearly.
- Whenever files are changed, always include a clean final explanation section called `Change Summary`.

The `Change Summary` must always contain these sections:

1. **What changed**
   - List the files, functions, classes, modules, configs, or structures that were changed.
   - Be specific about what was added, removed, renamed, moved, or updated.

2. **Why it changed**
   - Explain the reason for the change.
   - State whether it was done for bug fixing, readability, consistency, validation, architecture, maintainability, security, or performance.

3. **How it works now**
   - Briefly explain the new behavior after the change.
   - Mention any important flow updates, API behavior changes, validation changes, typing changes, or runtime differences.

4. **Anything important to review**
   - Mention breaking changes, migration needs, required env/config updates, manual checks, follow-up work, or anything that should be verified.

Rules for this summary:
- Keep it clean, direct, and easy to scan.
- Do not be vague.
- Do not say only `updated file X` without explaining what changed.
- Do not dump raw diffs unless explicitly requested.
- Prefer grouped summaries by file or by feature.
- Even for small edits, still include the full summary format in a shorter version.
- If no files were changed, explicitly say: **No files were changed**.
- In the summary, reference files using the formatting rules above:
  - plain filename when enough
  - otherwise short repo-relative path
  - never markdown file links
  - never absolute local paths

Preferred format:
### Change Summary

**What changed**
- ...

**Why it changed**
- ...

**How it works now**
- ...

**Query impact**
```graphql
query SomeOperation {
  ...
}
```
```JSON
{
  "someVariable": "value"
}
```

**Anything important to review**
- ...


Preferred format:
### Change Summary

**What changed**
- ...

**Why it changed**
- ...

**How it works now**
- ...

**Query impact**
```graphql
query SomeOperation {
  ...
}
```
```JSON
{
  "someVariable": "value"
}
```

**Anything important to review**
- ...


## Change Management Rules

- Preserve existing public GraphQL names unless a breaking change is explicitly intended.
- If you add a feature module, wire it through `AppModule` and follow the global guard/throttle architecture already used.
- If you add new list or detail reads, decide and document whether they need caching.
- If you add writes that affect cached reads, add invalidation in the same change.
- If you add new auth-sensitive mutations, enforce ownership or authorization checks in the service.
- If you add Prisma schema changes, keep indexes and uniqueness constraints aligned with the query patterns the feature will use.


## Change Management Rules

- Preserve existing public GraphQL names unless a breaking change is explicitly intended.
- If you add a feature module, wire it through `AppModule` and follow the global guard/throttle architecture already used.
- If you add new list or detail reads, decide and document whether they need caching.
- If you add writes that affect cached reads, add invalidation in the same change.
- If you add new auth-sensitive mutations, enforce ownership or authorization checks in the service.
- If you add Prisma schema changes, keep indexes and uniqueness constraints aligned with the query patterns the feature will use.

## What To Avoid

- Fat resolvers
- Raw unvalidated input passed into Prisma
- Returning Prisma models directly to GraphQL
- Inconsistent cache key naming
- Missing throttle annotations
- Missing `@Public()` on truly public operations
- Manual schema editing for `src/schema.gql`
- Silent swallowing of important persistence errors
- Counter updates outside transactions when consistency matters

## Definition Of Done For Changes

- Code follows the module structure and naming conventions in this repo.
- GraphQL DTO/input/model changes are reflected through code-first decorators.
- Service logic validates input, handles domain errors, and maps known Prisma failures.
- Auth, throttling, cache invalidation, and pagination rules are respected.
- Tests cover the changed behavior.
- Lint and tests should pass before considering the work complete.

## Final Check Before Completion

- Code compiles cleanly.
- Lint passes.
- Tests for changed behavior are updated.
- GraphQL schema changes are code-first and not manually edited in generated files.
- Auth, throttling, pagination, and cache invalidation rules are preserved.
- No sensitive fields are exposed.
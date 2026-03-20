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

## GraphQL Rules

- Keep the API code-first. Add or modify GraphQL decorators on classes instead of hand-editing schema files.
- Treat `src/schema.gql` as generated output.
- Keep GraphQL errors sanitized. Do not add formatting that leaks stack traces or internal metadata.
- When adding expensive queries, respect the existing query complexity infrastructure.
- For subscriptions, ensure the published payload shape matches the resolver subscription field name.

## Prisma Rules

- Reuse the shared `PrismaService`.
- Prefer explicit `select` objects for read queries.
- Keep “safe select” constants close to DTO/model definitions, following the existing module pattern.
- Use transactions when multiple writes must stay in sync, especially when updating denormalized counters such as `likesCount` or `commentsCount`.
- Check existence and ownership explicitly when that leads to clearer domain errors.
- Translate known Prisma codes like `P2002`, `P2003`, and `P2025` into user-facing Nest exceptions.
- If a new feature adds a denormalized counter, keep increment/decrement operations transactionally consistent.

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

## Output and Reference Formatting Rules

- When referencing project files in reviews, prompts, summaries, recommendations, or reports, use plain filenames or short repo-relative paths only.
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
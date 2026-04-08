# AGENTS.md

This file defines the working rules for contributors and coding agents in this repository. Follow these rules before adding features, editing existing code, or changing architecture.

## Purpose

- Preserve the current project style and architecture.
- Keep GraphQL behavior predictable and safe.
- Prevent regressions in validation, auth, caching, subscriptions, and Prisma workflows.
- Prefer consistency with the existing codebase over introducing new patterns.

## Project Stack

- Framework: NestJS 11
- API style: GraphQL code-first with Apollo
- Database: Prisma + MySQL
- Cache: `@nestjs/cache-manager` + Keyv + Redis
- Validation: `class-validator` at the GraphQL DTO boundary, and `zod` for service-layer command parsing in modules that follow that pattern
- Auth: JWT with Passport, GraphQL-aware guards, public resolver opt-out via `@Public()`
- Realtime: `graphql-ws` with Redis-backed pubsub
- Language: TypeScript with type-aware ESLint

## Non-Negotiable Rules

- Keep resolvers thin. Resolver methods should declare GraphQL shape, attach auth metadata, attach throttling, and delegate to services.
- Keep services responsible for domain behavior, validation parsing, authorization checks, cache invalidation, side-effect handling, and Prisma interaction.
- Do not expose sensitive Prisma fields directly through GraphQL models. Use safe DTO/select patterns already present in the repo.
- Do not bypass validation. GraphQL inputs must use DTO classes with decorators, and service-layer commands must be parsed with the module’s Zod schema when that pattern already exists.
- Do not remove pagination caps. Always clamp `take` using `PAGINATION` constants or the feature-specific cap.
- Never return unlimited rows from list-style queries.
- Do not introduce wildcard cache deletion. Use detail-key deletion plus version-key bumps for list invalidation.
- Do not leak internal error details to GraphQL clients. Throw explicit Nest exceptions or sanitized fallback errors.
- Do not put business logic in modules, decorators, guards, or bootstrap helpers.
- Do not query Prisma with `include` or `select` shapes that expose fields not represented by the public GraphQL contract.
- If service or domain behavior changes, update tests in the same change.

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
- For larger modules, `*read.service.ts`, `*cache.service.ts`, `*projection.service.ts`, and `*trigger.service.ts` are preferred names for feature-private collaborators when they improve cohesion.
- Keep these collaborators inside the same feature module unless the logic is truly infrastructure-level and reused across multiple features.

## Naming Rules

- Name GraphQL object types using the module’s existing public naming convention, such as `SafeUser`, `Post`, `PostDetail`, or `NotificationDTO`.
- Prefer naming the TypeScript class itself to match the intended public GraphQL object type name and use plain `@ObjectType()` when possible.
- Treat explicit `@ObjectType("PublicName")` names as a narrow exception for preserving an existing public schema name or when the TypeScript class name must intentionally differ from the public GraphQL contract name.
- Name GraphQL input types with the `Input` suffix.
- Name service-layer Zod command types with the `Command` suffix.
- Name Zod schemas with clear action names like `createUserCommandSchema`.
- Name cache version keys by collection, for example `v:user:list` or `v:posts:list`.
- Name detail cache keys by entity and id, for example `user:safe:${id}` or `posts:detail:${id}`.

## Resolver Rules

- Public queries and mutations must be marked with `@Public()`.
- Apply `@Throttle()` to every applicable query and mutation using the shared categories in `THROTTLE_LIMITS`.
- Use `@CurrentUser()` to access the authenticated user instead of reading GraphQL context manually, except when implementing subscription-specific filtering.
- Prefer `@Args()` argument objects for grouped query params such as pagination and filters.
- Keep resolver return types explicit when useful for readability and consistency.
- Every resolver operation must explicitly choose auth exposure, throttle category, GraphQL return type, and argument DTO/args class.

## Service Rules

- Services own domain behavior.
- Validate and normalize service inputs through the module Zod schema when the module already follows that pattern.
- Build Prisma write payloads explicitly. Do not spread unchecked user input into Prisma `data`.
- For update flows, only assign fields that are defined.
- Perform ownership checks in the service layer before protected updates or deletes.
- Translate known Prisma errors into precise Nest exceptions.
- Use `InternalServerErrorException` as a sanitized fallback for unexpected persistence failures.
- Re-throw intentional domain exceptions instead of wrapping them again.
- Do not wrap entire service methods in broad `try/catch` blocks unless needed for Prisma error mapping, external side-effect handling, or sanitized fallback errors.
- Treat the database write path as the source of truth and keep core correctness strict.
- Use transactions for operations that must succeed or fail together.
- For each mutation, classify steps as either core correctness or best-effort follow-up work.
- Do not make a mutation fail after a committed database write only because a non-critical post-commit side effect failed.
- If a non-critical post-commit side effect fails, prefer success plus logging over a false-negative mutation failure.
- Do not treat validation, authorization, password/security logic, token invalidation, or required counter consistency as best-effort work.
- When a feature service grows to coordinate distinct read concerns, write concerns, cache projection, or external side effects, extract feature-private collaborators inside the same module instead of enlarging the main service indefinitely.
- Prefer feature-private `*ReadService`, `*CacheService`, `*ProjectionService`, or `*TriggerService` helpers before introducing generic cross-project abstractions.
- Do not introduce repository abstractions by default. Use direct `PrismaService` access in feature services or feature-private collaborators unless persistence logic is duplicated enough to justify extraction.
- If introducing a repository-like helper, keep it feature-local first. Do not add a generic repository layer across the application without explicit need.

## Validation Rules

- GraphQL boundary validation belongs in DTO/input classes with `class-validator`.
- Input normalization at the DTO boundary should use existing transformers such as `@Trim()`.
- When a module uses service-level command parsing, keep its Zod schemas under `schemas/`.
- When parsing with Zod in services, use `parseWithBadRequest(...)` unless there is a deliberate reason to throw the raw Zod error.
- Keep normalization rules consistent with existing behavior.
- Trim user-entered text where appropriate.
- Lowercase canonical identifiers like usernames or emails when the feature already does so.
- Enforce password length constraints compatible with bcrypt.

## Auth and Security Rules

- The app is protected by default via the global GraphQL JWT guard. New public queries or mutations must opt out with `@Public()`.
- Do not implement ad hoc auth checks inside resolvers when the shared decorators or guards already cover the use case.
- Subscription authentication belongs in the GraphQL subscription configuration and subscription context handling, not in resolver business logic.
- Keep HTTP-level security setup centralized in bootstrap helpers like `setup-security.ts`.
- Preserve fail-fast environment validation through `src/config/env/env.schema.ts` when adding new env vars.
- For account-recovery or identity-sensitive flows such as password reset, avoid leaking whether an account exists through user-facing responses.
- Prefer generic initiation responses and secure token handling for reset or verification workflows.
- Do not log raw reset, verification, or other sensitive one-time tokens.

## GraphQL Rules

- Keep the API code-first. Add or modify GraphQL decorators on classes instead of hand-editing schema files.
- Treat `src/schema.gql` as generated output.
- Keep `introspectComments` enabled consistently in both the Nest GraphQL build plugin and the Jest AST transformer pipeline.
- Prefer comment introspection as the default source of public GraphQL descriptions for object types, input types, args, and fields.
- Use explicit decorator `description` values only when comment introspection cannot express the required GraphQL metadata cleanly or correctly.
- Keep GraphQL errors sanitized. Do not add formatting that leaks stack traces or internal metadata.
- When adding expensive queries, respect the existing query complexity infrastructure.
- For subscriptions, ensure the published payload shape matches the resolver subscription field name.
- Preserve safe machine-readable error metadata when the project intentionally exposes it.

## Prisma Rules

- Reuse the shared `PrismaService`.
- Prefer explicit `select` objects for read queries.
- Keep safe select constants close to DTO or model definitions, following the existing module pattern.
- Use transactions when multiple writes must stay in sync, especially when updating denormalized counters such as `likesCount` or `commentsCount`.
- Check existence and ownership explicitly when that leads to clearer domain errors.
- Translate known Prisma codes like `P2002`, `P2003`, and `P2025` into user-facing Nest exceptions.
- If a new feature adds a denormalized counter, keep increment and decrement operations transactionally consistent.
- Do not create ad hoc Prisma clients inside feature services, helpers, or request-scoped flows.
- Avoid patterns that accidentally create multiple connection pools unless there is a deliberate infrastructure reason.
- Never edit any file in `prisma/migrations/`.
- Never create, delete, rename, or rewrite migration files.
- Prisma-related code changes must be limited to `prisma/schema.prisma` unless the user explicitly requests migration work.
- If a change would normally require a migration, modify only `prisma/schema.prisma` and clearly state that migration generation and review are still required.

## Cache Rules

- Use `CacheHelperService` instead of calling the cache manager directly from feature services.
- Use read-through caching via `getOrSet(...)` for stable reads.
- Use detail-key deletion for single-entity invalidation.
- Use version bumps for list invalidation.
- Keep cache keys deterministic and parameter-aware.
- When a write affects related entities, invalidate related caches too.
- Invalidate only the caches actually affected by the write.
- Any mutation that affects cached reads must update the relevant detail keys and list version keys in the same change.
- Do not cache values whose freshness must reflect a just-written counter unless the service explicitly overwrites or recomputes that field, as done with `viewsCount`.

## Pagination and Query Rules

- Every list-style query must clamp `take` to `PAGINATION.MAX_TAKE` or the corresponding feature-specific cap.
- Default pagination should use the shared defaults in `PAGINATION`.
- Default chronological ordering should remain newest-first unless the feature explicitly requires another default.
- Reuse `ChronologicalOrder` and `toSortDirection(...)` instead of inventing new order enums for the same concept.
- Keep list queries bounded with shared pagination caps and explicit ordering.
- When introducing or redesigning list APIs that are expected to support real multi-page frontend usage, prefer a real pagination contract such as cursor-based pagination with clear next-page semantics.
- Avoid extending `take`-only list contracts for new scalable user-facing flows when a practical multi-page contract is required.

## DTO and Model Rules

- Keep GraphQL input classes focused on input validation and transformation.
- Keep GraphQL object models and DTOs aligned with what the API returns, not with full Prisma models.
- Do not use explicit `@ObjectType("...")` names as a routine pattern. Use them only for public contract stability or deliberate TypeScript/public GraphQL name separation.
- In DTO files, add one concise JSDoc comment immediately before each exported DTO type and each exported Prisma select constant so the safe shape and the select intent are both documented consistently.
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
- Persist notification or event state in the database before publishing realtime updates when the feature requires durability.
- Do not rely on in-memory pubsub as the long-term architecture for features that must work across multiple app instances.
- Prefer shared realtime transport such as Redis-backed pubsub or another broker-backed approach when the feature is intended for multi-instance deployment.
- When a mutation triggers asynchronous follow-up work, separate correctness-critical writes from post-commit delivery concerns using a feature-private trigger or delivery helper when that improves module cohesion.

## Environment Rules

- Every new required env var must be added to `env.schema.ts`.
- Parse booleans and numeric env values explicitly through Zod helpers instead of relying on raw strings.
- Keep defaults in the schema when the application already treats the variable as optional-with-default.

## Testing Rules

- Add or update `*.spec.ts` files whenever service behavior, guards, transformers, schema parsing, or bootstrap logic changes.
- Service tests should mock `PrismaService` and other collaborators directly, matching the existing style.
- Test at least one success path and one failure, validation, or authorization path for changed behavior.
- Verify cache behavior when changing cached flows.
- Verify Prisma error mapping when changing write logic.
- Verify pagination clamping and default ordering in list services.
- Keep tests focused on behavior, not implementation trivia.

## Style Rules

- Match the current import style: external imports first, internal `@/` imports next, and type-only imports where appropriate.
- Keep imports grouped, minimal, stable, and free of unused entries.
- Prefer the repository’s established `@/` alias for internal imports.
- If a file imports values and types from the same module in separate import statements, merge them when possible.
- Keep comments useful and specific.
- Prefer explicit local variables for normalized values and cache keys.
- Keep functions and methods readable over overly compact.
- Stay compatible with the current TypeScript and ESLint configuration.
- If the same narrow logic is repeated across multiple files, extract it into a small shared helper only when the abstraction clearly improves readability and consistency.
- Do not create shared helpers for one-off logic or vague abstractions.
- Avoid growing a single feature service into a catch-all coordinator for reads, writes, cache projection, validation parsing, and external side effects when those responsibilities can be split cleanly inside the feature.

## Output and Reference Formatting Rules

- When referencing project files in reviews, prompts, summaries, recommendations, reports, or change explanations, use plain filenames or short repo-relative paths only.
- Never return markdown links for project files.
- Never return absolute local filesystem paths in outputs.
- If the filename is already clear enough, return only the plain filename.
- If extra context is needed, return a short repo-relative path in plain text, not as a markdown link.
- Do not add redundant path formatting when the file name is already being returned clearly.

## Change Management Rules

- Preserve existing public GraphQL names unless a breaking change is explicitly intended.
- If you add a feature module, wire it through `AppModule` and follow the global guard and throttle architecture already used.
- If you add new list or detail reads, decide whether they need caching.
- If you add writes that affect cached reads, add invalidation in the same change.
- If you add new auth-sensitive mutations, enforce ownership or authorization checks in the service.
- If you add Prisma schema changes, keep indexes and uniqueness constraints aligned with the query patterns the feature will use.
- If a change includes both refactoring and behavior changes, keep the behavioral diff easy to identify and explain that clearly in the summary.
- New GraphQL operations must be reviewed for auth exposure, throttle category, pagination bounds, cache needs, DTO/select safety, and test coverage before completion.

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
- GraphQL DTO, input, and model changes are reflected through code-first decorators.
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

## Required Final Explanation Format

Whenever files are changed, always include a clean final explanation section called `Change Summary`.

## Project Scoring Format

Always include a structured project scorecard in the final output, even when I did not explicitly ask for a project assessment.

Scoring goals:
- Score the project as it exists after the reviewed implementation or change set.
- Reflect whether the new change increased, decreased, or did not materially change project quality.
- Score both the whole project and the quality impact of the newly implemented change.
- Be evidence-based: do not invent improvements if the implementation is incomplete, misplaced, under-tested, or introduces regressions.

Required scoring rules:
- Always provide an overall project score from `0` to `100`.
- Always provide a feature/change impact score from `0` to `100`.
- Always show the score change compared with the most recent previously stated overall project score when one exists.
- Express the overall score change as a signed percentage in a compact format such as `+3%`, `-2%`, or `0%`.
- Also show a signed percentage for the new change’s net impact on the project, such as:
  - `Change impact on project quality: +4%`
  - `Change impact on project quality: -2%`
- If there is no prior score available in the current conversation or provided context, explicitly say:
  - `No previous baseline available for overall percentage change.`
- If no trustworthy prior change baseline exists, explicitly say:
  - `No previous feature baseline available; change impact percentage is based on current implementation quality and net architectural effect.`
- Always display the category breakdown as separate labeled parts.
- Keep the top-level category labels stable unless I explicitly ask for a different framework.
- Add second-level sub-scores wherever the implementation evidence supports it.
- When code changes were made, update the scorecard to reflect the new project state after the change.
- When no code or repo files were changed, you may keep previous scores only if there is no new evidence that justifies a change.
- Do not inflate the score just because a new feature or change exists. A poorly integrated change can reduce the score.
- Do not treat “more features” as automatically “better project quality”.
- If the implementation is only partially complete, score both:
  - implementation quality
  - integration quality
- If the implementation introduces regressions, inconsistency, weak tests, unsafe data exposure, poor cache invalidation, wrong-layer logic, or degraded maintainability, lower the relevant categories accordingly.

Default required top-level category breakdown:
- Architecture
- Codebase discipline/consistency
- Security/auth boundaries
- Validation/data safety
- Caching/realtime design
- Testing maturity
- Scalability of public query contracts
- DX/maintainability

Expanded required category breakdown:
- GraphQL API contract design
- Resolver/service boundary discipline
- Prisma/data modeling quality
- Prisma/data access safety
- Error handling and public error contract
- Feature modularity and ownership
- Authorization and enforcement correctness
- Safe DTO/select discipline
- Cursor pagination consistency
- Cache invalidation discipline
- Realtime/subscription design
- Domain side-effect correctness
- Read-model/filtering correctness
- Transactional correctness
- Idempotency and mutation contract quality
- Test coverage breadth
- Test coverage depth/quality
- Regression risk
- Production readiness
- Change-management discipline
- Long-term maintainability

Module-level scoring:
Always add a module-by-module score section when enough evidence exists.

At minimum, score the modules or areas most impacted by the reviewed change, such as:
- the newly added or modified feature module
- related domain modules
- shared DTO/args/pagination utilities if touched
- auth/guards if touched
- caching helpers if touched
- GraphQL exception/error layer if touched
- Prisma schema layer if touched
- tests

For each module or affected area:
- return only the module or area name and score
- optionally add a very short note if the score changed materially because of the new change

Feature/change-specific scoring:
Always include a dedicated implementation score section with at least:
- Product/requirement contract alignment
- Schema design quality
- GraphQL surface design
- Service-layer correctness
- Enforcement/integration correctness
- Read-model/filtering correctness
- Cache coherence
- Error contract alignment
- Test completeness
- Demo readiness

Interpretation rules:
- A change should increase the overall score only if it improves the project without meaningfully harming consistency, correctness, or maintainability.
- A change may cause a mixed result:
  - for example, product capability may increase while architecture or testing scores decrease.
- If the implementation is strong but under-tested, reflect that tension in separate categories instead of flattening the judgment.
- If the implementation is correct but too broad in scope and overreaches into unrelated reads, abstractions, or modules, reduce maintainability and architecture scores.
- If the implementation is tightly scoped, well-placed, safe, and well-tested, reward it in architecture, maintainability, security, and production readiness.

Required summary after the scorecard:
After the scorecard, include a brief explanation of:
- the main reasons the overall project score increased, decreased, or stayed flat
- the main reasons the reviewed change had a positive or negative net effect
- which categories improved the most
- which categories were hurt the most
- what the highest-leverage fixes are to improve the score further

Recommended output shape:

Overall project score: 84/100
Score change vs previous overall score: +3%
Implementation/change score: 86/100
Change impact on project quality: +4%

Top-level categories
- Architecture: 91
- Codebase discipline/consistency: 89
- Security/auth boundaries: 88
- Validation/data safety: 90
- Caching/realtime design: 85
- Testing maturity: 80
- Scalability of public query contracts: 72
- DX/maintainability: 83

Expanded categories
- GraphQL API contract design: 90
- Resolver/service boundary discipline: 93
- Prisma/data modeling quality: 87
- Prisma/data access safety: 89
- Error handling and public error contract: 88
- Feature modularity and ownership: 91
- Authorization and enforcement correctness: 86
- Safe DTO/select discipline: 90
- Cursor pagination consistency: 84
- Cache invalidation discipline: 81
- Realtime/subscription design: 78
- Domain side-effect correctness: 76
- Read-model/filtering correctness: 80
- Transactional correctness: 88
- Idempotency and mutation contract quality: 92
- Test coverage breadth: 74
- Test coverage depth/quality: 77
- Regression risk: 70
- Production readiness: 82
- Change-management discipline: 88
- Long-term maintainability: 84

Module-by-module scores
- feature module: 89
- related domain module A: 84
- related domain module B: 76
- prisma schema: 87
- error layer: 88
- tests: 75

Implementation/change breakdown
- Product/requirement contract alignment: 90
- Schema design quality: 87
- GraphQL surface design: 89
- Service-layer correctness: 91
- Enforcement/integration correctness: 85
- Read-model/filtering correctness: 80
- Cache coherence: 79
- Error contract alignment: 88
- Test completeness: 73
- Demo readiness: 86

Score change explanation
- Main reasons for increase:
  - ...
- Main reasons for decrease:
  - ...
- Highest-leverage fixes:
  - ...

Important:
- Be honest and critical.
- Do not give every category a high score by default.
- Use the scores to reflect real implementation quality, not intent.
- If the implementation is incomplete, the score must show that.
- If the implementation is strong in design but weak in tests, separate those judgments clearly.

### Change Summary

**What changed**
- List the files, functions, classes, modules, configs, or structures that were changed.
- Be specific about what was added, removed, renamed, moved, or updated.

**Why it changed**
- Explain the reason for the change.
- State whether it was done for bug fixing, readability, consistency, validation, architecture, maintainability, security, or performance.

**How it works now**
- Briefly explain the new behavior after the change.
- Mention any important flow updates, API behavior changes, validation changes, typing changes, or runtime differences.

**Query impact**
- Include this section only when a change adds, removes, renames, or behaviorally changes a GraphQL operation or its inputs or outputs.

**Anything important to review**
- Mention breaking changes, migration needs, required env or config updates, manual checks, follow-up work, or anything that should be verified.

Rules for this summary:

- Keep it clean, direct, and easy to scan.
- Do not be vague.
- Do not say only `updated file X` without explaining what changed.
- Do not dump raw diffs unless explicitly requested.
- Prefer grouped summaries by file or by feature.
- Even for small edits, still include the full summary format in a shorter version.
- If no files were changed, explicitly say: `No files were changed`.
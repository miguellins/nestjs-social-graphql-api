# AGENTS.md

This file defines the working rules for contributors and coding agents in this repository. Follow these rules before adding features, editing existing code, or changing architecture.

## Purpose
- Preserve the current project style and architecture.
- Keep GraphQL behavior predictable, safe, and consistent.
- Prevent regressions in validation, auth, caching, subscriptions, Prisma workflows, tests, and docs.
- Prefer existing codebase patterns over new abstractions.

## Rule Priority
1. Follow `Non-Negotiable Rules` first.
2. For any changed file, follow the matching section: Resolver, Service, DTO, Prisma, Cache, Testing, Documentation, Environment, or Style.
3. If rules conflict, preserve public GraphQL behavior, data safety, auth, validation, cache correctness, and migration safety first.
4. Do not weaken existing production guardrails to make a change smaller.

## Project Stack
- Framework: NestJS 11
- API style: GraphQL code-first with Apollo
- Database: Prisma + MySQL
- Cache: `@nestjs/cache-manager` + Keyv + Redis
- Validation: `class-validator` at the GraphQL DTO boundary; `zod` for service-layer command parsing in modules that already use that pattern
- Auth: JWT with Passport, GraphQL-aware guards, public resolver opt-out via `@Public()`
- Realtime: `graphql-ws` with Redis-backed pubsub
- Language: TypeScript with type-aware ESLint

## MCP Usage Rules
- Use installed MCP servers automatically when they are relevant; do not wait for the user to manually request an MCP.
- Use MCP output as supporting context, not as authority over this file or the repository. Existing repo patterns and these rules win over generic MCP suggestions.
- Use `context7` when current external library documentation is needed for NestJS, Apollo GraphQL, GraphQL, Prisma, Redis, Keyv, Express, Node.js, TypeScript, Jest, or other package APIs.
- Use `nestjs` when implementing or reviewing NestJS modules, resolvers, services, guards, interceptors, filters, pipes, providers, testing patterns, request lifecycle behavior, security hardening, or project structure.
- Use `apollo-mcp` when inspecting the GraphQL schema, verifying operation names, arguments, return shapes, schema descriptions, operation reports, manual API tests, or GraphQL contract impact.
- Use `redis` when debugging local/dev cache or pubsub behavior, verifying Redis connectivity, inspecting key types, TTLs, counts, or checking cache invalidation effects.
- Use `docker` when debugging local/dev containers, Docker Compose services, API or worker startup, MySQL or Redis container state, container logs, health, exposed ports, Docker socket/context mismatches, or environment mismatches between the API, worker, database, and cache.
- Use `git` when inspecting repository status, staged and unstaged diffs, changed files, commit history, branch state, or preparing change summaries.
- Use `git` before final summaries when code, docs, Prisma schema, GraphQL DTOs/resolvers, tests, config, or tooling files were changed.
- Use `git` to verify unrelated files were not changed and to detect forbidden edits such as manual `src/schema.gql` changes or edits under `prisma/migrations/`.
- Prefer read-only MCP actions during investigation. For Docker MCP, prefer `list_containers`, `fetch_container_logs`, `list_images`, `list_networks`, and `list_volumes` before using terminal commands. For Git MCP, prefer status, diff, log, and branch inspection.
- Do not use Redis MCP write/destructive tools such as `set`, `delete`, `rename`, `expire`, `publish`, stream/list/set/hash/zset mutations, JSON writes, or vector writes unless the user explicitly asks and the target is local/dev.
- Do not use Docker MCP write/destructive tools such as `create_container`, `start_container`, `stop_container`, `restart_container`, `remove_container`, image build/pull/push/removal, volume or network mutations, prune actions, Docker Compose mutations, or daemon/socket changes unless the user explicitly asks and the target is local/dev.
- Do not use Git MCP write/destructive tools such as `add`, `commit`, `reset`, `checkout`, `merge`, `rebase`, `pull`, `push`, branch deletion, staging, or unstaging unless the user explicitly asks for that exact action.
- Do not use database/cache/container/Git MCPs against production, staging, shared, or unknown environments unless the user explicitly confirms the target and action.
- Do not use MCPs to bypass tests, type checks, lint, Prisma safety, GraphQL code-first rules, migration restrictions, or documented local setup steps.
- If an MCP is unavailable, continue with repository inspection or safe terminal inspection and state the limitation only when it affects the result.

## Skill Usage Rules
- Use installed skills automatically when they are relevant; do not wait for the user to manually request a skill.
- Use `caveman` for short-enough answers, quick explanations, small fixes, simple command guidance, or compact next-step instructions where plain language is more useful than a full review.
- Do not use `caveman` when the user asks for a detailed audit, architecture review, full implementation plan, long Markdown file, contract report, or manual API test suite.
- Use `diagnose` when debugging failing behavior, unclear root causes, broken tests, runtime errors, GraphQL response mismatches, cache/pubsub inconsistencies, Prisma/MySQL issues, Docker/local environment problems, or any investigation where hypotheses and verification steps matter.
- Use `zoom-out` before large architectural changes, new feature design, rollout planning, cross-module refactors, or when a local fix may have broader effects on GraphQL contracts, auth, caching, persistence, workers, docs, or operations.
- Use `setup-matt-pocock-skills` only when installing, updating, repairing, or verifying the Matt Pocock/Total TypeScript skill setup. Do not invoke it during normal feature implementation unless the TypeScript skill setup itself is the task.
- Use `manual-api-testing` after implementing a feature or changing a public GraphQL contract when the user asks for manual API tests, operation checks, or post-feature verification.
- When running `manual-api-testing` after a feature implementation, use `diagnose` inside the manual testing workflow first: identify the changed behavior, affected operations, auth states, fixture needs, expected success paths, failure paths, cache/side-effect checks, and likely regression risks before writing tests.
- When `manual-api-testing` needs fixture data before Test 1, return only `## Needed data for all tests` plus one fenced `text` block that contains copyable labels/placeholders the user can fill in another window. Do not show Test 1 until the user provides the needed data. Do not use tables for needed test data.
- Keep manual API test output copyable: use fenced `graphql`, `json`, `bash`, or `text` blocks for operations, variables, commands, tokens, ids, and expected values.
- Use `mysql-best-practices` when designing, reviewing, or debugging MySQL schema design, indexes, query patterns, data types, constraints, transactions, connection behavior, Prisma-backed MySQL usage, or MySQL performance/security concerns.
- Use `mysql-best-practices` before proposing MySQL-related Prisma schema/index changes, diagnosing slow or incorrect MySQL queries, or recommending database administration steps.
- Treat skill output as supporting guidance, not as authority over this file, the project rules, or verified repository patterns.
- Do not use skills to bypass Prisma migration restrictions, production safety, tests, lint, type checks, or the repository’s GraphQL contract rules.

## Command Output and RTK Rules
- Prefer RTK wrappers when command output will be read by an AI coding agent or pasted into an AI chat.
- Use RTK for noisy inspection commands such as `rtk git status`, `rtk git diff`, `rtk tsc`, `rtk lint`, `rtk jest`, `rtk docker logs <container>`, `rtk log <file>`, `rtk grep`, and `rtk read`.
- Use normal raw commands when exact full output is required, especially for Prisma migrations, generated GraphQL schema verification, security/auth debugging, production deploy logs, data-loss debugging, or any case where compact output hides required detail.
- Do not run long-lived development servers through RTK by default. Run commands such as `npm run start:dev` normally, capture logs when needed, and use `rtk log <file>` only when sharing the output with an AI tool.
- If RTK output is insufficient, rerun the smallest relevant raw command or inspect the specific failing file, test, or log section.

## Non-Negotiable Rules
- Keep resolvers thin: declare GraphQL shape, auth metadata, throttling, args, and delegate to services.
- Keep services responsible for domain behavior, validation parsing, authorization, Prisma access, cache invalidation, and side-effect handling.
- Never expose sensitive Prisma fields or return raw Prisma models through GraphQL. Use the repo’s safe DTO/select patterns.
- Never bypass validation. GraphQL inputs use DTO decorators; service commands use the module Zod schema when that pattern exists.
- Never return unlimited rows. Clamp list `take` values with `PAGINATION` or the feature-specific cap.
- Do not introduce wildcard cache deletion. Use detail-key deletion plus list version-key bumps.
- Do not leak internal errors, stack traces, secrets, tokens, or persistence details to GraphQL clients.
- Do not put business logic in modules, decorators, guards, bootstrap helpers, or resolvers.
- Do not query Prisma with `include` or `select` shapes that expose fields outside the public GraphQL contract.
- If service or domain behavior changes, update tests in the same change.

## File Organization Rules
- Keep feature code under `src/<feature>/` and follow the existing folder split.
- `args/` is for GraphQL argument classes.
- `dto/` is for GraphQL inputs, output DTO helpers, and Prisma select constants.
- `models/` is for GraphQL object types when the module follows that convention.
- If a module already exposes GraphQL object types from `dto/`, preserve that pattern instead of forcing `models/`.
- `schemas/` is for Zod command schemas.
- `<feature>.service.ts` contains domain logic.
- `<feature>.resolver.ts` contains GraphQL entry points.
- `<feature>.module.ts` contains Nest module wiring.
- Keep shared infrastructure under `src/common/`, `src/bootstrap/`, `src/graphql/`, `src/cache/`, and `src/config/`.
- Use the `@/` alias for internal imports.
- For larger modules, prefer feature-private `*ReadService`, `*CacheService`, `*ProjectionService`, or `*TriggerService` collaborators when they improve cohesion.
- Keep feature-private collaborators inside the same feature module unless the logic is truly infrastructure-level and reused across multiple features.

## Naming Rules
- Name GraphQL object types using the module’s public convention, such as `SafeUser`, `Post`, `PostDetail`, or `NotificationDTO`.
- Prefer TypeScript class names that match public GraphQL object type names and plain `@ObjectType()` when possible.
- Use explicit `@ObjectType("PublicName")` only to preserve an existing public schema name or intentionally separate TypeScript and GraphQL names.
- Use `Input` for GraphQL input types, `Command` for service-layer Zod command types, and clear action names for Zod schemas such as `createUserCommandSchema`.
- Name cache version keys by collection, for example `v:user:list` or `v:posts:list`.
- Name detail cache keys by entity and id, for example `user:safe:${id}` or `posts:detail:${id}`.

## Resolver Rules
- Every resolver operation must explicitly choose auth exposure, throttle category, GraphQL return type, and argument DTO/args class.
- Mark public queries and mutations with `@Public()`.
- Apply `@Throttle()` to every applicable query and mutation using `THROTTLE_LIMITS` categories.
- Use `@CurrentUser()` for authenticated users instead of reading GraphQL context manually, except for subscription-specific filtering.
- Prefer `@Args()` argument objects for grouped pagination and filters.
- Keep resolver return types explicit when useful for readability and consistency.

## Service Rules
- Services own domain behavior.
- Validate and normalize service inputs through the module Zod schema when the module already follows that pattern.
- Build Prisma write payloads explicitly; never spread unchecked user input into Prisma `data`.
- In update flows, assign only fields that are defined.
- Perform ownership checks in services before protected updates or deletes.
- Translate known Prisma errors into precise Nest exceptions; use sanitized `InternalServerErrorException` fallbacks for unexpected persistence failures.
- Re-throw intentional domain exceptions instead of wrapping them again.
- Avoid broad `try/catch` around entire service methods unless needed for Prisma mapping, external side-effect handling, or sanitized fallback errors.
- Treat the database write path as the source of truth and keep core correctness strict.
- Use transactions for writes that must succeed or fail together, especially denormalized counters.
- For each mutation, classify steps as core correctness or best-effort follow-up work.
- Use `runBestEffort` only for non-critical post-success side effects such as cache invalidation, cache refresh, subscription publish, notification delivery, analytics, or similar follow-up work.
- Never use best-effort handling for validation, authorization, password/security logic, token invalidation, ownership checks, required transactions, required counter consistency, or any step that must fail the request if it fails.
- If a non-critical post-commit side effect fails, prefer success plus logging over a false-negative mutation failure.
- Before using `runBestEffort`, confirm the system remains correct if that step fails after the database write already succeeded.
- Split large feature services into feature-private collaborators for distinct read, write, cache projection, or delivery concerns.
- Prefer feature-private collaborators before generic cross-project abstractions.
- Use `*ReadService` for query/read orchestration only; keep write-side counters, cache mutation, and delivery side effects in the main service or a more specific collaborator.
- Do not introduce repository abstractions by default. Use direct `PrismaService` access unless duplicated persistence logic justifies a feature-local helper.

## Validation Rules
- GraphQL boundary validation belongs in DTO/input classes with `class-validator`.
- DTO-boundary normalization should use existing transformers such as `@Trim()`.
- Keep Zod schemas under `schemas/` when a module uses service-level command parsing.
- Parse Zod commands with `parseWithBadRequest(...)` unless there is a deliberate reason to throw raw Zod errors.
- Keep normalization consistent with existing behavior: trim user text where appropriate and lowercase canonical identifiers when the feature already does so.
- Enforce password length constraints compatible with bcrypt.

## Auth and Security Rules
- The app is protected by default via the global GraphQL JWT guard; new public operations must opt out with `@Public()`.
- Do not implement ad hoc resolver auth checks when shared decorators or guards cover the use case.
- Subscription auth belongs in GraphQL subscription configuration and subscription context handling, not resolver business logic.
- Keep HTTP-level security setup centralized in bootstrap helpers such as `setup-security.ts`.
- For account-recovery or identity-sensitive flows, avoid leaking whether an account exists.
- Prefer generic initiation responses, secure token handling, and no logging of reset, verification, or other sensitive one-time tokens.

## GraphQL Rules
- Keep the API code-first. Add or modify decorators on classes instead of hand-editing schema files.
- Treat `src/schema.gql` as generated output.
- Keep `introspectComments` enabled in both the Nest GraphQL build plugin and Jest AST transformer pipeline.
- Prefer comment introspection for public GraphQL descriptions; use explicit decorator `description` only when comments cannot express the metadata cleanly.
- Keep GraphQL errors sanitized while preserving safe machine-readable metadata that the project intentionally exposes.
- Respect existing query complexity infrastructure for expensive queries.
- For subscriptions, ensure the published payload shape matches the resolver subscription field name.
- Use `apollo-mcp` to inspect current schema and operation shape when reviewing GraphQL contract impact; never use it to justify manual edits to `src/schema.gql`.

## Prisma Rules
- Reuse the shared `PrismaService`; do not create ad hoc Prisma clients or accidental extra connection pools.
- Prefer explicit `select` objects and keep safe select constants close to DTO/model definitions.
- Use transactions when multiple writes must stay in sync, especially `likesCount`, `commentsCount`, or other denormalized counters.
- Check existence and ownership explicitly when that gives clearer domain errors.
- Translate known Prisma codes such as `P2002`, `P2003`, and `P2025` into user-facing Nest exceptions.
- If a new feature adds a denormalized counter, keep increment/decrement operations transactionally consistent.
- Never edit, create, delete, rename, or rewrite files in `prisma/migrations/`.
- Prisma-related code changes must be limited to `prisma/schema.prisma` unless the user explicitly requests migration work.
- If a change would normally require a migration, modify only `prisma/schema.prisma` and state that migration generation and review are still required.
- Use `mysql-best-practices` for MySQL-specific schema, index, query, transaction, data type, and performance/security decisions that affect Prisma-backed persistence.

## Cache Rules
- Use `CacheHelperService` instead of calling the cache manager directly from feature services.
- Use read-through caching via `getOrSet(...)` for stable reads.
- Use deterministic, parameter-aware keys.
- Use detail-key deletion for single-entity invalidation and version bumps for list invalidation.
- When a write affects related entities, invalidate only the affected related caches.
- Any mutation that affects cached reads must update relevant detail keys and list version keys in the same change.
- Do not cache values whose freshness must reflect a just-written counter unless the service explicitly overwrites or recomputes that field, as done with `viewsCount`.
- Use `redis` MCP for local/dev read-only cache inspection when debugging key names, TTLs, counts, cache invalidation, or pubsub behavior.

## Pagination and Query Rules
- Every list-style query must clamp `take` to `PAGINATION.MAX_TAKE` or the feature-specific cap.
- Use shared pagination defaults from `PAGINATION`.
- Default chronological ordering should remain newest-first unless the feature explicitly requires another default.
- Reuse `ChronologicalOrder` and `toSortDirection(...)` instead of creating duplicate order enums.
- Keep list queries bounded with explicit ordering.
- For new scalable user-facing list APIs, prefer a real pagination contract such as cursor-based pagination with clear next-page semantics.
- Avoid extending `take`-only contracts when practical multi-page frontend usage is required.

## DTO and Model Rules
- Keep GraphQL input classes focused on validation and transformation.
- Keep GraphQL object models and DTOs aligned with the API return shape, not full Prisma models.
- Use explicit `@ObjectType("...")` names only for public contract stability or intentional TypeScript/public GraphQL name separation.
- In DTO files, add one concise JSDoc comment before each exported DTO type and exported Prisma select constant.
- Never expose secrets such as password hashes.
- Prefer explicit safe DTO/select exports such as `SafeUserSelect`, `SafePostListSelect`, and `NotificationSelect`.
- If a field is nullable in GraphQL, declare it intentionally with the appropriate decorator options.

## Notifications and Subscription Rules
- Do not create self-notifications for actor-recipient self actions.
- Persist notification or event state in the database before publishing realtime updates when durability is required.
- Publish subscription events only after the database write succeeds.
- If publish fails, log it without failing the committed write unless product requirements explicitly change.
- Subscription filtering must use the authenticated subscriber id from GraphQL context and must not trust client-supplied recipient ids.
- Treat realtime subscriptions as a delivery acceleration layer, not the source of truth.
- Do not rely on in-memory pubsub as the long-term architecture for multi-instance features.
- Prefer Redis-backed pubsub or another broker-backed transport for multi-instance deployment.
- When a mutation triggers async follow-up work, separate correctness-critical writes from post-commit delivery concerns with a feature-private trigger or delivery helper when it improves cohesion.

## Environment Rules
- Preserve fail-fast environment validation through `src/config/env/env.schema.ts`.
- Every new env var used by the app must be added to `src/config/env/env.schema.ts` and the repository `.env` file in the same change.
- Use safe local values, placeholders, or default-aligned values in `.env`.
- Parse boolean and numeric env values explicitly through Zod helpers instead of relying on raw strings.
- Keep defaults in the schema when the app treats a variable as optional-with-default.
- Do not commit real secrets, tokens, passwords, private keys, or production credentials in `.env`.

## Documentation Rules
- When adding a new feature, update, create, or edit the feature documentation in the same change.
- Update existing feature docs instead of creating duplicates.
- If no feature doc exists, create one in the appropriate `docs/` location.
- New features must update `docs/reviews/backend-maturity-review.md` and `docs/reviews/module-review.md` in the same change.
- Keep docs focused on current behavior, public GraphQL contract impact, auth rules, cache behavior, side effects, testing notes, and known limitations.
- Do not document planned or future behavior as implemented behavior.

## Testing Rules
- Add or update `*.spec.ts` files whenever service behavior, guards, transformers, schema parsing, or bootstrap logic changes.
- Service tests should mock `PrismaService` and collaborators directly, matching existing style.
- Cover at least one success path and one failure, validation, or authorization path for changed behavior.
- Verify cache behavior when changing cached flows.
- Verify Prisma error mapping when changing write logic.
- Verify pagination clamping and default ordering in list services.
- Keep tests focused on behavior, not implementation trivia.

## Style Rules
- Match current import style: external imports first, internal `@/` imports next, and type-only imports where appropriate.
- Keep imports grouped, minimal, stable, merged when possible, and free of unused entries.
- Keep comments useful and specific.
- Prefer explicit local variables for normalized values and cache keys.
- Keep functions and methods readable over overly compact.
- Stay compatible with the current TypeScript and ESLint configuration.
- Extract repeated narrow logic only when a small shared helper clearly improves readability and consistency.
- Do not create shared helpers for one-off logic or vague abstractions.
- Do not let one feature service become a catch-all coordinator when responsibilities can be split cleanly inside the feature.

## JSDoc Comment Rules
- Add one concise one-line JSDoc comment before every service class method, including public methods, private methods, lifecycle hooks, and feature-private service collaborators such as `*ReadService`, `*CacheService`, `*ProjectionService`, and `*TriggerService`.
- Add one concise one-line JSDoc comment before each exported DTO type and exported Prisma select constant in DTO files.
- Use `/** Summarizes the method, DTO, or select intent. */` and describe behavior, validation, authorization, cache behavior, side effects, persistence intent, safe shape, or returned shape instead of restating the identifier.
- Do not require one-line JSDoc on resolver methods, module methods, guards, decorators, arbitrary exported functions, file-local helpers, or tiny inline callbacks unless they are service methods, exported DTO types, or exported Prisma select constants in DTO files.
- Avoid generic comments such as `/** Handles the request. */`, `/** Gets data. */`, or comments that only repeat the identifier.
- Use multi-line JSDoc only when a service method, DTO type, or select constant has non-obvious constraints, side effects, security behavior, or return semantics that cannot fit clearly in one line.

## Plan Decision Review Rules
- When asked to review a project plan and extract implementation decisions, identify decisions only; do not implement the plan.
- Include meaningful product scope, schema/model, API/GraphQL, auth/permission, UX/client-facing behavior, data lifecycle, infra/caching/queue/background-job, security/operational, testing strategy, and rollout/backward-compatibility decisions.
- Exclude generic coding tasks, obvious implementation steps, duplicated decisions, and low-level style choices unless they affect architecture or public behavior.
- For each decision, include the main options, one recommended option, why it is recommended, and a simple explanation of the impact.
- Favor a clean, maintainable, production-like v1 unless the plan clearly points to a different tradeoff.
- Return decision reviews as one plain, copyable fenced `text` block unless the user explicitly asks for another format.
- Inside the fenced `text` block, use only the decision content. Do not add intro text, final summaries, file cards, markdown links, Cursor-specific references, bullets, tables, or extra commentary.
- Use this exact repeated structure for each decision:

```text
1 - [Decision name]
[Option 1]

[Option 2]

[Option 3]

Recommended: [selected option]

Why: [brief reason the recommendation fits the plan and repo]

Explanation: [plain-language impact of choosing this option]
```

- Number decisions sequentially as `1 -`, `2 -`, `3 -`, and so on. Do not use markdown heading markers such as `# 1 -`.
- List options as plain standalone lines without `Option A`, bullet markers, checkboxes, tables, or nested formatting.
- Keep `Recommended:`, `Why:`, and `Explanation:` labels exactly as written for every decision.
- Keep each decision self-contained so the user can copy one decision or the whole block without needing surrounding context.


## Output and Reference Formatting Rules
- When the user asks for copyable text, return plain Markdown that can be selected and pasted cleanly outside Cursor.
- For plan decision reviews, return one fenced `text` block containing all numbered decisions in the required decision-review structure.
- For copyable operations, variables, commands, env snippets, fixture templates, or manual test steps, use fenced code blocks with the correct language label when helpful.
- Avoid tables for copyable prompts, manual tests, needed data, and decision reviews unless the user explicitly asks for a table.
- Keep copyable sections free of UI-only formatting, file cards, absolute local paths, and markdown links unless the user explicitly asks for links.
- When referencing project files in reviews, prompts, summaries, recommendations, reports, or change explanations, use plain filenames or short repo-relative paths only.
- Never return markdown links or absolute local filesystem paths for project files.
- If the filename is clear enough, return only the filename.
- If extra context is needed, return a short repo-relative path in plain text.
- Do not add redundant path formatting when the file name is already clear.

## Change Management Rules
- Preserve existing public GraphQL names unless a breaking change is explicitly intended.
- If you add a feature module, wire it through `AppModule` and follow the global guard and throttle architecture already used.
- If you add new list or detail reads, decide whether they need caching.
- If you add writes that affect cached reads, add invalidation in the same change.
- If you add auth-sensitive mutations, enforce ownership or authorization checks in the service.
- If you add Prisma schema changes, align indexes and uniqueness constraints with the query patterns the feature will use.
- If a change includes both refactoring and behavior changes, keep the behavioral diff easy to identify and explain it clearly in the summary.
- Review new GraphQL operations for auth exposure, throttle category, pagination bounds, cache needs, DTO/select safety, and test coverage before completion.

## What To Avoid
- Fat resolvers or business logic outside services.
- Raw unvalidated input passed into Prisma.
- Returning Prisma models or sensitive fields directly to GraphQL.
- Missing auth exposure, throttle, pagination, cache invalidation, or tests.
- Manual edits to `src/schema.gql` or files under `prisma/migrations/`.
- Wildcard cache deletion or inconsistent cache key naming.
- Silent swallowing of correctness-critical persistence errors.
- Counter updates outside transactions when consistency matters.

## Final Check Before Completion
- Code compiles cleanly.
- Lint passes.
- Tests cover changed behavior.
- GraphQL schema changes are code-first; never manually edit `src/schema.gql`.
- Auth, throttling, pagination, DTO/select safety, and cache invalidation rules are preserved.
- New env vars are reflected in both `src/config/env/env.schema.ts` and `.env`.
- New or changed features update feature docs plus `docs/reviews/backend-maturity-review.md` and `docs/reviews/module-review.md`.
- Manual API test preflight output is copyable and includes a fillable fenced fixture template when data is needed.
- Plan decision reviews are returned as one fenced `text` block, numbered with `1 -`, table-free, and contain only decisions with options, `Recommended:`, `Why:`, and `Explanation:`.
- No sensitive fields, secrets, stack traces, or internal persistence details are exposed.
- Relevant MCPs and skills were used when they would improve accuracy, including `caveman` for short answers, `diagnose` for investigations and manual API test pre-analysis, `zoom-out` for broad design impact, `setup-matt-pocock-skills` for TypeScript skill setup maintenance, and `mysql-best-practices` for MySQL-specific changes.
- Relevant MCPs were used when they provided safer or more current context for library docs, NestJS patterns, GraphQL schema checks, Redis cache inspection, Docker container inspection, or Git change inspection.

## Agent skills

### Issue tracker
Work is tracked as local markdown under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels
The five canonical triage roles map to the same string ids listed in `docs/agents/triage-labels.md`.

### Domain docs
Single-context layout: domain glossary and ADRs at the repo root when present (`CONTEXT.md`, `docs/adr/`). See `docs/agents/domain.md`.

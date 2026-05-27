<p align="center">
  <img src="./assets/tech-stack.png" alt="Project technology stack" width="900" />
</p>


# NestJS Social GraphQL API
A production-oriented social platform backend built with NestJS, GraphQL, Prisma, MySQL, Redis, and Cloudflare R2.

This project currently covers users, auth, posts, comments, likes, follows, blocks, content reports, moderation review, notifications, realtime subscriptions, and media upload flows. The codebase is organized as a code-first GraphQL monolith with safe DTO/select patterns, global GraphQL guards, throttling, Redis-backed caching, and Redis-backed subscription delivery.

## What This Project Does
This backend currently provides:
- User registration and profile management
- JWT-based authentication with role-aware request context
- User roles with `USER`, `MODERATOR`, and `ADMIN`
- Password reset initiation and completion
- Email verification initiation and completion
- Refresh-session rotation and logout
- Cursor-based pagination for list-style queries
- Relevance-ranked post and user search with MySQL FULLTEXT
- Post creation, listing, detail view, update, and delete
- Comment creation, listing, update, and delete
- Like/unlike post behavior with atomic counter updates
- Follow/unfollow user behavior
- User blocking and blocked-user listing
- Content reporting for posts and comments
- Moderator/admin report review with dismiss/action flows
- Notification persistence and realtime notification delivery
- Direct-to-R2 media upload orchestration for posts
- Authenticated media listing and signed media view URLs
- Public-safe data exposure with explicit DTO/select patterns
- Global throttling and auth-by-default resolver protection
- Centralized validation and GraphQL-safe error handling

## GraphQL Error Contract
GraphQL errors are sanitized but machine-readable.

Current public shape:
- `message`
- `errors[].extensions.code`
- `errors[].extensions.fields` when relevant

Example:
```json
{
  "errors": [
    {
      "message": "Already exists: email",
      "extensions": {
        "code": "DUPLICATE",
        "fields": ["email"]
      }
    }
  ],
  "data": null
}
```

Stable public error codes:
- `BAD_REQUEST`
- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `DUPLICATE`
- `FOREIGN_KEY`
- `DB_ERROR`
- `INTERNAL_SERVER_ERROR`

Notes:
- clients that only read `message` remain compatible
- clients can now branch on `extensions.code`
- `fields` is included only when relevant and safe
- stack traces and internal exception objects are not exposed

## Stack and Tools
- Runtime: Node.js, TypeScript
- Framework: NestJS 11
- API: GraphQL code-first with Apollo
- ORM/DB: Prisma + MySQL
- Cache: `@nestjs/cache-manager` + Keyv + Redis
- Auth: Passport JWT (`@nestjs/passport`, `@nestjs/jwt`)
- Realtime: `graphql-ws` + Redis-backed pubsub (`graphql-redis-subscriptions`)
- Media Storage: Cloudflare R2 via S3-compatible APIs
- Validation: `class-validator`, `class-transformer`, `zod`
- Security: `helmet`, GraphQL JWT guard, throttling guard, password peppering
- Password Hashing: `bcrypt`
- Media Validation: `sharp`
- Build/Dev: Nest CLI, `ts-node`, `nodemon`, `tsc-alias`
- Code Quality: ESLint + Prettier

## Agent Skills and MCP Usage
Use these project skills and MCP servers as supporting context while preserving
the repository rules in `AGENTS.md` as the higher authority. Use relevant MCPs
and skills automatically when they improve accuracy.

Default MCP posture:
- prefer read-only MCP actions during investigation
- use Redis, Docker, and Git write or destructive MCP actions only when the user
  explicitly asks and the target is local/dev
- never use MCP output to bypass tests, lint, Prisma safety, GraphQL code-first
  rules, migration restrictions, or repository setup steps

### Skills
- `caveman`
  - When: short answers, quick explanations, small fixes, simple command guidance, or compact next steps.
  - Why: keeps routine communication concise without losing technical accuracy.

- `diagnose`
  - When: debugging failing behavior, broken tests, runtime errors, GraphQL response mismatches, cache or pubsub issues, Prisma/MySQL issues, Docker/local environment problems, or any unclear root-cause investigation.
  - Why: enforces a disciplined reproduce, minimize, hypothesize, instrument, fix, and regression-test workflow.

- `zoom-out`
  - When: large architectural changes, new feature design, rollout planning, cross-module refactors, or local fixes with broader GraphQL, auth, cache, persistence, worker, docs, or operational impact.
  - Why: checks the broader system effect before committing to a narrow implementation.

- `setup-matt-pocock-skills`
  - When: installing, updating, repairing, or verifying the Matt Pocock/Total TypeScript skill setup.
  - Why: keeps the local issue-tracker, triage-label, and domain-doc context wired correctly for those skills.

- `manual-api-testing`
  - When: the user asks for manual API tests, operation checks, or post-feature verification after a public GraphQL contract or behavior change.
  - Why: produces copyable GraphQL/API checks based on real fixture data and expected success, failure, auth, cache, and side-effect behavior. Use `diagnose` first inside this workflow to identify changed behavior, affected operations, auth states, fixture needs, and regression risks.

- `mysql-best-practices`
  - When: designing, reviewing, or debugging MySQL schema, indexes, query patterns, data types, constraints, transactions, connection behavior, Prisma-backed MySQL usage, or MySQL performance and security concerns.
  - Why: keeps database decisions aligned with MySQL behavior instead of generic ORM assumptions.

### MCP Servers
- `eraser`
  - When: creating or reviewing architecture diagrams, implementation diagrams, or visual system maps.
  - Why: supports diagram-first explanation for complex backend flows and design discussions.

- `Lucid Software`
  - When: creating, editing, exporting, or sharing Lucid documents such as flowcharts, mind maps, sequence diagrams, org charts, and architecture diagrams.
  - Why: turns planned or reviewed system structure into durable visual documentation.

- `context7`
  - When: current external library documentation is needed for NestJS, Apollo GraphQL, GraphQL, Prisma, Redis, Keyv, Express, Node.js, TypeScript, Jest, or other package APIs.
  - Why: verifies package behavior against current docs instead of relying on memory.

- `nestjs`
  - When: implementing or reviewing NestJS modules, resolvers, services, guards, interceptors, filters, pipes, providers, tests, lifecycle behavior, security hardening, or project structure.
  - Why: provides NestJS-specific context while keeping this repo's existing patterns authoritative.

- `apollo-mcp`
  - When: inspecting the GraphQL schema, operation names, arguments, return shapes, descriptions, operation reports, manual API tests, or GraphQL contract impact.
  - Why: helps verify the public GraphQL API surface without manually editing generated schema output.

- `redis`
  - When: debugging local/dev cache or pubsub behavior, verifying Redis connectivity, inspecting key types, TTLs, counts, or checking cache invalidation effects.
  - Why: gives read-only visibility into cache and subscription state when diagnosing Redis-backed behavior.

- `git`
  - When: inspecting repository status, staged and unstaged diffs, changed files, commit history, branch state, preparing change summaries, or doing final checks after code, docs, Prisma schema, GraphQL DTO/resolver, test, config, or tooling changes.
  - Why: confirms exactly what changed and helps detect unrelated edits, forbidden schema edits, or migration-file changes before completion.

- `docker`
  - When: debugging local/dev containers, Docker Compose services, API or worker startup, MySQL or Redis container state, container logs, health, exposed ports, Docker socket/context mismatches, or environment mismatches.
  - Why: provides container-level evidence for local runtime and infrastructure issues.

## Architecture Overview

### Application bootstrap
`src/main.ts`:
- creates the Nest app
- enables the global validation pipe
- registers the GraphQL exception filter
- applies security headers
- enables graceful shutdown hooks

### Root module
`src/app.module.ts`:
- loads environment configuration globally
- registers the Redis-backed cache
- configures GraphQL code-first schema generation into `src/schema.gql`
- registers global throttling
- wires feature modules:
  - `OpsModule`
  - `AuthModule`
  - `UsersModule`
  - `PostsModule`
  - `SearchModule`
  - `MediaModule`
  - `LikesModule`
  - `OutboxModule`
  - `BlocksModule`
  - `LoggingModule`
  - `FollowsModule`
  - `ReportsModule`
  - `CommentsModule`
  - `BookmarksModule`
  - `NotificationsModule`
  - `RequestContextModule`
  - `GraphqlSubscriptionsModule`
- registers global guards:
  - `GqlThrottlerGuard`
  - `GqlJwtGuard`
  - `GqlRolesGuard`

### Shared infrastructure
The shared/common layer already provides several repository-wide standards:
- GraphQL auth-by-default with `@Public()` opt-out
- service-level Zod parsing via `parseWithBadRequest(...)`
- read-through caching and version-key invalidation via `CacheHelperService`
- shared cursor pagination helpers with opaque `createdAt + id` cursors
- best-effort side-effect handling via `runBestEffort(...)`
- fail-fast environment validation in `src/config/env/env.schema.ts`
- Redis-backed subscription publishing in `src/graphql/subscriptions/`

## Data Model Overview
Defined in `prisma/schema.prisma`.

### Prisma Schema Overview (diagram)
<p align="center">
  <img src="./assets/tables.png" alt="Prisma schema overview" width="1200" />
</p>

### Core entities
- `User`
  - unique `email`
  - unique `username`
  - role-based auth via `UserRole`
  - has many posts, comments, likes, follows, blocks, reports, notifications, password reset tokens, refresh sessions, email verification tokens, and media uploads

- `Post`
  - belongs to an author
  - has optional `title`
  - has denormalized `likesCount`, `commentsCount`, and `viewsCount`
  - has many comments, likes, and media attachments

- `Comment`
  - belongs to a post
  - belongs to an author

- `Like`
  - belongs to a user and a post
  - unique pair `@@unique([userId, postId])`

- `Follow`
  - self-relation between users
  - unique pair `@@unique([followerId, followingId])`

- `UserBlock`
  - self-relation between users
  - unique pair `@@unique([blockerId, blockedId])`

- `ContentReport`
  - submitted by a reporter
  - targets exactly one post or comment at the application layer
  - stores reason, optional details, and moderation status

- `Notification`
  - belongs to an actor and a recipient
  - stores type, title, body, related entity id, and read state

- `Media`
  - belongs to an owner user
  - tracks upload state, storage location, MIME type, bytes, dimensions, and attachment state

- `PostMedia`
  - ordered join table between posts and media items

- `PasswordResetToken`
  - stores hashed one-time-use reset tokens with expiry

- `RefreshSession`
  - stores hashed refresh-session tokens with rotation and revocation support

- `EmailVerificationToken`
  - stores hashed one-time-use verification tokens with expiry and used-at state

## Feature Modules
### Auth
- `login(input)`
- `requestEmailVerification`
- `verifyEmail(input)`
- `refreshSession(input)`
- `logout(input)`
- `requestPasswordReset(input)`
- `resetPassword(input)`

Current strengths:
- generic reset-initiation response to avoid account enumeration
- generic email-verification initiation response where appropriate
- hashed reset tokens with expiry and single-use semantics
- hashed verification tokens with expiry and single-use semantics
- password reset performed transactionally
- password hash upgrade path during login
- persisted refresh sessions with hashed token storage
- refresh-token rotation and explicit logout/revocation
- role propagation through JWT validation and request/subscription context

### Users
- `users(first, after, orderBy)`
- `userById(id)`
- `userByUsername(username)`
- `createUser(input)`
- `updateMe(input)`
- `myPrivacySettings`
- `updateMyPrivacySetting(input)`
- `suspendUser(input)`
- `reactivateUser(input)`
- `deleteMe`

Current strengths:
- safe user DTO/select shape
- feature-private `UserCacheService`
- cache refresh and invalidation after writes
- service-level validation and password hashing
- cursor-based user list pagination
- privacy/account-state controls for visibility-sensitive flows
- moderator/admin user suspension and reactivation flows
- account auth state includes `isEmailVerified`

### Posts
- `posts(first, after, orderBy, q)`
- `postsByUsername(username, first, after, orderBy)`
- `postById(id)`
- `myFeed(first, after, orderBy)`
- `homeFeed(first, after, orderBy)`
- `createPost(input)`
- `updatePost(id, input)`
- `deletePost(id)`
- `removePostByModerator(input)`

Current strengths:
- separate safe list/detail DTOs
- `PostReadService` for detail reads and view-count refresh handling
- `FeedReadService` for `homeFeed` reads and optional projection rollout
- explicit cache versioning and detail invalidation
- ownership checks in the service layer
- cursor-based pagination for post lists and feed reads

### Search
- `searchPosts(q, first)`
- `searchUsers(q, first)`

Current strengths:
- dedicated `SearchModule` for discovery beyond hashtag autocomplete
- MySQL FULLTEXT candidate lookup for posts and users
- safe hydration through existing DTO/select patterns
- viewer-aware post visibility, block, and POSTS mute filtering
- ACTIVE-only user discovery with mutual-block filtering
- versioned read-through cache keys scoped by normalized query, viewer, and page size

### Comments
- `commentsByPost(postId, first, after, orderBy)`
- `createComment(input)`
- `updateComment(commentId, input)`
- `deleteComment(commentId)`
- `removeCommentByModerator(input)`

Current strengths:
- comment count updates are kept transactionally consistent
- ownership checks live in the service
- post detail cache invalidation is handled after writes
- cursor-based pagination for post comment reads
- one-level replies use bounded inline reply projection
- reply notifications can use durable outbox delivery

### Likes
- `likes(first, after, orderBy, postId, userId)`
- `likeById(id)`
- `createLike(postId)`
- `deleteLike(id)`

Current strengths:
- like creation/deletion is transactionally tied to `Post.likesCount`
- duplicate likes are mapped cleanly from Prisma uniqueness errors
- notification creation is triggered as a best-effort side effect
- narrowed nested post payloads and cursor-based like list pagination

### Follows
- `follows(first, after, orderBy)`
- `followById(id)`
- `followUser(userId)`
- `myIncomingFollowRequests(first, after, orderBy)`
- `myOutgoingFollowRequests(first, after, orderBy)`
- `approveFollowRequest(requestId)`
- `rejectFollowRequest(requestId)`
- `cancelFollowRequest(requestId)`
- `deleteFollow(id)`

Current strengths:
- self-follow prevention
- duplicate follow protection
- private-account follow request workflow
- clear split between incoming and outgoing pending request review
- target-owned approval/rejection and requester-owned cancel flow
- flexible unfollow behavior by relation id or target user id
- visibility-aware cache invalidation for follow changes
- follow notification triggering
- cursor-based follow list pagination

### Blocks
- `blockUser(input)`
- `unblockUser(input)`
- `myBlockedUsers(first, after, orderBy)`

Current strengths:
- self-block prevention
- idempotent block/unblock behavior
- safe blocked-user list exposure
- cursor-based blocked-user pagination

### Reports and Moderation Review
- `reportPost(input)`
- `reportComment(input)`
- `reviewReports(first, after, orderBy, status, targetType)`
- `dismissReport(reportId)`
- `actionReport(reportId)`

Current strengths:
- post and comment report submission with duplicate-open prevention
- self-report prevention and missing-target handling
- durable report persistence with explicit `OPEN`, `DISMISSED`, and `ACTIONED` states
- moderator/admin-only review access
- cursor-based moderation review list with `status` and `targetType` filters
- status-only moderation actions in V1 with no notification, realtime, or auto-hide side effects

### Notifications
- `myNotifications(first, after, orderBy, status)`
- `unreadNotificationsCount`
- `markNotificationAsRead(notificationId)`
- `markAllNotificationsAsRead`
- `notificationReceived` subscription

Current strengths:
- durable notification persistence before realtime delivery
- self-notification suppression
- separate trigger, persistence, and delivery helpers
- authenticated subscription filtering by subscriber id
- cursor-based notification pagination
- comment-reply and follow-request notification delivery can run through the outbox worker

### Media
- `requestPostMediaUpload(input)`
- `completePostMediaUpload(input)`
- `attachMediaToPost(input)`
- `myMedia(first, after, orderBy)`
- `mediaSignedViewUrl(mediaId)`

Current strengths:
- explicit upload lifecycle
- post ownership checks
- MIME type, size, and metadata validation
- feature-private query, policy, validation, and read projection helpers
- direct client upload to R2 instead of proxying file bodies through Nest
- cursor-based media list pagination

### GraphQL Subscriptions
`src/graphql/subscriptions/` provides:
- Redis-backed pubsub
- authenticated `graphql-ws` handshake
- namespaced triggers
- centralized connection handling


## GraphQL Operations
### Queries
- `users`
- `userById`
- `userByUsername`
- `mySessions`
- `myPrivacySettings`
- `posts`
- `postsByUsername`
- `postById`
- `searchPosts`
- `searchUsers`
- `myFeed`
- `homeFeed`
- `commentsByPost`
- `likes`
- `likeById`
- `follows`
- `followById`
- `myIncomingFollowRequests`
- `myOutgoingFollowRequests`
- `myBlockedUsers`
- `reviewReports`
- `myNotifications`
- `unreadNotificationsCount`
- `myMedia`
- `mediaSignedViewUrl`
- `myBookmarks`

### Mutations
- `login`
- `refreshSession`
- `logout`
- `logoutCurrentSession`
- `revokeSession`
- `revokeOtherSessions`
- `requestPasswordReset`
- `resetPassword`
- `requestEmailVerification`
- `verifyEmail`
- `createUser`
- `updateMe`
- `updateMyPrivacySetting`
- `suspendUser`
- `reactivateUser`
- `deleteMe`
- `createPost`
- `updatePost`
- `deletePost`
- `removePostByModerator`
- `createComment`
- `updateComment`
- `deleteComment`
- `removeCommentByModerator`
- `createLike`
- `deleteLike`
- `followUser`
- `approveFollowRequest`
- `rejectFollowRequest`
- `cancelFollowRequest`
- `deleteFollow`
- `blockUser`
- `unblockUser`
- `reportPost`
- `reportComment`
- `dismissReport`
- `actionReport`
- `markNotificationAsRead`
- `markAllNotificationsAsRead`
- `requestPostMediaUpload`
- `completePostMediaUpload`
- `attachMediaToPost`
- `bookmarkPost`
- `removeBookmark`

### Subscriptions
- `notificationReceived`

## Security and Reliability Techniques Used
- GraphQL JWT guard with `@Public()` opt-out
- GraphQL role guard with `@Roles(...)` metadata for moderator/admin operations
- GraphQL throttling guard with shared rate-limit categories
- DTO validation at the GraphQL boundary
- service-level Zod parsing where modules follow that pattern
- safe DTO/select exports for public reads
- cursor-based pagination with opaque cursors and bounded page size
- hashed refresh-session tokens with rotation and revocation
- hashed email verification tokens with controlled verification flow
- Prisma transactions for consistency-critical updates
- best-effort side effects after committed writes
- version-key cache invalidation instead of wildcard deletes
- fail-fast environment validation
- Redis-backed subscription transport
- Prometheus metrics for GraphQL, cache, Prisma, guards, outbox, and feed projection
- Optional OpenTelemetry tracing with OTLP HTTP export and log correlation

## Environment Variables
Common configured values:
```env
PORT=3000
DATABASE_URL=mysql://root:root@localhost:3307/mydb
JWT_SECRET=your_long_secret
JWT_EXPIRES_IN=7d
PASSWORD_RESET_TOKEN_TTL_MINUTES=30
REFRESH_SESSION_TTL_DAYS=30
PASSWORD_PEPPER=your_password_pepper
REDIS_URL=redis://localhost:6379
GRAPHQL_SUBSCRIPTIONS_REDIS_URL=redis://localhost:6379
GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE=graphql-subscriptions
EMAIL_VERIFICATION_TTL_HOURS=24
R2_ACCOUNT_ID=your_r2_account_id
R2_BUCKET=your_bucket
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_PUBLIC_BASE_URL=https://cdn.example.com
R2_PRESIGNED_URL_TTL_SECONDS=1800
MEDIA_IMAGE_MAX_BYTES=10485760
MEDIA_VIDEO_MAX_BYTES=104857600
GRAPHQL_COMPLEXITY_ENFORCE=false
GRAPHQL_COMPLEXITY_LOG=true
GRAPHQL_COMPLEXITY_WARN_AT=100
GRAPHQL_COMPLEXITY_MAX=500
GRAPHQL_COMPLEXITY_MAX_QUERY_NODES=2000
METRICS_ENABLED=false
METRICS_HOST=127.0.0.1
METRICS_PORT=9090
METRICS_DB_REFRESH_INTERVAL_MS=15000
TRACING_ENABLED=false
OTEL_SERVICE_NAME=nestjs-social-graphql-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=development
OUTBOX_ENABLED=false
OUTBOX_COMMENT_REPLIED_ENABLED=false
OUTBOX_FOLLOW_REQUESTED_ENABLED=false
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=20
OUTBOX_MAX_ATTEMPTS=10
OUTBOX_PROCESSED_RETENTION_HOURS=24
OUTBOX_FAILED_RETENTION_HOURS=168
FEED_PROJECTION_ENQUEUE_ENABLED=false
FEED_PROJECTION_WORKER_ENABLED=false
FEED_PROJECTION_READ_ENABLED=false
FEED_PROJECTION_BACKFILL_ENABLED=false
FEED_PROJECTION_PURGE_ENABLED=false
```

The authoritative validation source is `src/config/env/env.schema.ts`.

When `METRICS_ENABLED=true`, each process exposes Prometheus metrics on a
dedicated internal HTTP server at `http://METRICS_HOST:METRICS_PORT/metrics`.
Run the API and worker with different metrics ports if they are colocated on
the same host.

## Metrics Endpoint
`MetricsModule` provides a Prometheus-compatible metrics endpoint for the API
and outbox worker processes. The endpoint is intended for internal scraping
only and is not exposed through the GraphQL or Nest HTTP route tree.

Enable it per process with:
```env
METRICS_ENABLED=true
METRICS_HOST=127.0.0.1
METRICS_PORT=9090
METRICS_DB_REFRESH_INTERVAL_MS=15000
```

Scrape each process independently:
```text
http://METRICS_HOST:METRICS_PORT/metrics
```

If the API and worker run on the same host, use different ports, such as
`9090` for the API and `9091` for the worker. Keep `METRICS_HOST` bound to a
private interface, loopback address, or cluster-internal address.

The v1 metrics surface focuses on outbox and home-feed projection health:
- `outbox_worker_ticks_total{process="worker"}`
- `outbox_worker_tick_errors_total{process="worker"}`
- `outbox_events_total{process="worker",event_type,outcome}`
- `outbox_event_processing_seconds{process="worker",event_type}`
- `outbox_batch_size{process="worker"}`
- `outbox_pending_count{process="worker"}`
- `outbox_failed_count{process="worker"}`
- `outbox_processing_count{process="worker"}`
- `outbox_oldest_pending_age_seconds{process="worker"}`
- `outbox_oldest_processing_age_seconds{process="worker"}`
- `metrics_db_last_refresh_timestamp_seconds{process="worker",component="outbox"}`
- `metrics_db_refresh_errors_total{process="worker",component="outbox"}`
- `feed_projection_purge_runs_total{process="worker"}`
- `feed_projection_purge_errors_total{process="worker"}`
- `feed_projection_purge_seconds{process="worker"}`
- `home_feed_shadow_compare_total{process="api"}`
- `home_feed_shadow_compare_mismatch_total{process="api"}`
- `home_feed_projection_cleanup_enqueue_total{process="api",outcome}`

If `/metrics` is not reachable, confirm `METRICS_ENABLED=true`, verify the
configured host and port, check for port collisions between colocated
processes, and confirm the scraper can reach the private bind address. If
backlog gauges look stale, check `metrics_db_refresh_errors_total`,
`metrics_db_last_refresh_timestamp_seconds`, worker database connectivity, and
sanitized worker logs.

Do not add user ids, event ids, aggregate ids, or raw error messages as metric
labels. Do not fail readiness only because backlog metrics are high; alert on
metrics instead. See `docs/observability.md` for the full metrics catalog, scrape setup, dashboard, alerts, and tracing configuration.

## Tracing
OpenTelemetry tracing is disabled by default. Enable it only when an OTLP HTTP collector endpoint is configured:

```env
TRACING_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318/v1/traces
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=1.0
```

The API service name defaults to `nestjs-social-graphql-api`; the worker entrypoint defaults to `nestjs-social-graphql-api-worker`. Logs include `traceId` and `spanId` when a span is active, but clients only receive `x-request-id`. Incident correlation steps are in `docs/runbooks/observability-trace-log-correlation.md`.

## Local Setup
1. Install dependencies:
```bash
npm install
```

2. Ensure MySQL and Redis are running.

3. Run Prisma migrations:
```bash
npx prisma migrate dev
```

Search uses MySQL FULLTEXT indexes declared in `prisma/schema.prisma`. After schema changes, generate and review the Prisma migration before rollout, and validate local/dev `ft_min_word_len` and `innodb_ft_min_token_size` are both `2` when short-token search matters.

4. Start in development:
```bash
npm run start:dev
```

5. Open the GraphQL endpoint:
- `http://localhost:3000/graphql`

## Docker Setup
This repository includes a Dockerfile and Docker Compose setup for local development.

### Prerequisites
- Docker Engine + Docker Compose v2

### 1) Create a local env file
```bash
cp .env.example .env
```

At minimum, set:
- `JWT_SECRET`
- `PASSWORD_PEPPER`

### 2) Build and start the stack
```bash
docker compose up --build
```

GraphQL:
- `http://localhost:3000/graphql`

Health:
- `http://localhost:3000/health/live`
- `http://localhost:3000/health/ready`

MySQL (host):
- `localhost:3308` (container `3306`)

Redis (host):
- `localhost:6380`

### 3) Prisma generate and migrations (safe workflow)
Prisma Client generation is handled during Docker image builds.

Run migrations explicitly (recommended for local/dev):
```bash
docker compose run --rm api npx prisma migrate dev
```

Production-style migration deploy (non-destructive but still requires reviewed migrations):
```bash
docker compose run --rm api npx prisma migrate deploy
```

Notes:
- Do not edit anything under `prisma/migrations/` manually.
- This project intentionally does not auto-run migrations on container startup.

### Optional: run the worker
The worker is defined behind a Compose profile so it’s opt-in:
```bash
docker compose --profile worker up --build
```

### Stop and clean up
```bash
docker compose down
```

Remove volumes (this deletes local MySQL data):
```bash
docker compose down -v
```

## Available Scripts
- `npm run build` -> builds Nest app and resolves path aliases
- `npm run start` -> runs compiled app
- `npm run start:worker` -> runs the compiled outbox worker entrypoint
- `npm run start:dev` -> dev mode
- `npm run start:worker:dev` -> dev worker mode
- `npm run start:debug` -> debug/watch mode
- `npm run lint` -> lint
- `npm run format` -> Prettier format
- `npm test` -> unit tests
- `npm run test:watch` -> unit tests in watch mode
- `npm run test:cov` -> unit tests with coverage
- `npm run test:debug` -> unit tests under the Node inspector

## Project Structure
The project is organized around feature modules, shared API/platform infrastructure, operational support, and observability.

```mermaid
flowchart TB
  ROOT["NestJS Social GraphQL API"]

  ROOT --> SRC["Application Source<br/>src/"]
  ROOT --> SUPPORT["Project Support"]

  SRC --> FEATURES["Feature Modules<br/>auth · users · follows · blocks · mutes<br/>posts · comments · likes · bookmarks<br/>mentions · notifications · search · reports"]
  SRC --> PLATFORM["API Platform<br/>graphql · common · config · bootstrap · ops"]
  SRC --> INFRA["Infrastructure<br/>cache · prisma · media · outbox"]
  SRC --> OBS["Observability<br/>metrics · tracing"]

  SUPPORT --> DATABASE["Database Schema<br/>prisma/schema.prisma"]
  SUPPORT --> DOCS["Documentation<br/>docs/plans · docs/reviews · docs/runbooks"]
  SUPPORT --> HTTP["HTTP Examples<br/>http/"]
  SUPPORT --> MONITORING["Monitoring<br/>monitoring/prometheus · monitoring/grafana"]
  SUPPORT --> SCRIPTS["Maintenance Scripts<br/>scripts/"]
```

<details>
<summary>Full folder tree</summary>

```text
src/
  auth/            # login + password reset
  blocks/          # user block workflows
  bootstrap/       # app bootstrap helpers
  cache/           # cache module configuration
  bookmarks/       # private saved-post workflows
  comments/        # comment CRUD + post comment reads
  common/          # guards, decorators, constants, filters, args, helpers
  config/          # env schema and config helpers
  follows/         # follow graph
  graphql/         # GraphQL config, middleware, fields, subscriptions
  likes/           # like workflows + counters
  media/           # media upload orchestration and storage integration
  mentions/        # mention parsing and mention workflows
  metrics/         # Prometheus-compatible metrics exposure
  tracing/         # OpenTelemetry tracing bootstrap and helpers
  mutes/           # user mute workflows
  notifications/   # notification persistence + delivery
  search/          # MySQL-native post and user discovery
  ops/             # HTTP liveness/readiness endpoints
  outbox/          # durable background event processing
  posts/           # post CRUD, feed, detail reads, media attachment integration
  prisma/          # Prisma service/module
  reports/         # content reports + moderation review
  users/           # user CRUD + cache helpers

prisma/
  schema.prisma

docs/
  plans/           # implementation plans and operational design notes
  reviews/         # project and module review documents
  runbooks/        # operational response guides

http/              # checked-in HTTP request examples

monitoring/
  prometheus/      # alert rules for operational metrics
  grafana/         # dashboard JSON exports

scripts/           # repository maintenance scripts
```

</details>

## Design Choices Summary
- Code-first GraphQL to keep the schema aligned with TypeScript declarations
- Safe DTO/select pairing to prevent accidental field leakage
- Service-owned domain logic with thin resolvers
- Denormalized counters for read performance
- Global auth-by-default GraphQL protection
- Role-aware authorization for moderation operations
- Shared cursor pagination with `items + pageInfo`
- Read-through caching plus version-key invalidation
- Feature-private helpers where complexity justifies them
- Best-effort side effects after the write path commits
- Redis-backed subscriptions instead of in-memory pubsub
- Durable outbox processing for selected notification and feed-projection work

---

Author: Miguel Lins

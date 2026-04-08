# NestJS Social GraphQL API
A production-oriented social platform backend built with NestJS, GraphQL, Prisma, MySQL, Redis, and Cloudflare R2.

This project currently covers users, auth, posts, comments, likes, follows, notifications, realtime subscriptions, and media upload flows. The codebase is organized as a code-first GraphQL monolith with safe DTO/select patterns, global GraphQL guards, throttling, Redis-backed caching, and Redis-backed subscription delivery.

## What This Project Does
This backend currently provides:
- User registration and profile management
- JWT-based authentication
- Password reset initiation and completion
- Cursor-based pagination for list-style queries
- Post creation, listing, detail view, update, and delete
- Comment creation, listing, update, and delete
- Like/unlike post behavior with atomic counter updates
- Follow/unfollow user behavior
- Notification persistence and realtime notification delivery
- Direct-to-R2 media upload orchestration for posts
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
  - `AuthModule`
  - `UsersModule`
  - `PostsModule`
  - `MediaModule`
  - `LikesModule`
  - `FollowsModule`
  - `CommentsModule`
  - `NotificationsModule`
  - `GraphqlSubscriptionsModule`
- registers global guards:
  - `GqlThrottlerGuard`
  - `GqlJwtGuard`

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

### Core entities
- `User`
  - unique `email`
  - unique `username`
  - has many posts, comments, likes, follows, notifications, password reset tokens, and media uploads

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

## Feature Modules
### Auth
- `login(input)`
- `refreshSession(input)`
- `logout(input)`
- `requestPasswordReset(input)`
- `resetPassword(input)`

Current strengths:
- generic reset-initiation response to avoid account enumeration
- hashed reset tokens with expiry and single-use semantics
- password reset performed transactionally
- password hash upgrade path during login
- persisted refresh sessions with hashed token storage
- refresh-token rotation and explicit logout/revocation

### Users
- `users(first, after, orderBy)`
- `userById(id)`
- `userByUsername(username)`
- `createUser(input)`
- `updateMe(input)`
- `deleteMe`

Current strengths:
- safe user DTO/select shape
- feature-private `UserCacheService`
- cache refresh and invalidation after writes
- service-level validation and password hashing
- cursor-based user list pagination

### Posts
- `posts(first, after, orderBy, q)`
- `postsByUsername(username, first, after, orderBy)`
- `postById(id)`
- `myFeed(first, after, orderBy)`
- `createPost(input)`
- `updatePost(id, input)`
- `deletePost(id)`

Current strengths:
- separate safe list/detail DTOs
- `PostReadService` for detail reads, feed reads, and view-count refresh handling
- explicit cache versioning and detail invalidation
- ownership checks in the service layer
- cursor-based pagination for post lists and feed reads

### Comments
- `commentsByPost(postId, first, after, orderBy)`
- `createComment(input)`
- `updateComment(commentId, input)`
- `deleteComment(commentId)`

Current strengths:
- comment count updates are kept transactionally consistent
- ownership checks live in the service
- post detail cache invalidation is handled after writes
- cursor-based pagination for post comment reads

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
- `createFollow(followingId)`
- `deleteFollow(id)`

Current strengths:
- self-follow prevention
- duplicate follow protection
- flexible unfollow behavior by relation id or target user id
- follow notification triggering
- cursor-based follow list pagination

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

This is already stronger than in-memory pubsub and is designed for multi-instance deployment.

## GraphQL Operations
### Queries
- `users`
- `userById`
- `userByUsername`
- `posts`
- `postsByUsername`
- `postById`
- `myFeed`
- `commentsByPost`
- `likes`
- `likeById`
- `follows`
- `followById`
- `myNotifications`
- `unreadNotificationsCount`
- `myMedia`
- `mediaSignedViewUrl`

### Mutations
- `login`
- `refreshSession`
- `logout`
- `requestPasswordReset`
- `resetPassword`
- `createUser`
- `updateMe`
- `deleteMe`
- `createPost`
- `updatePost`
- `deletePost`
- `createComment`
- `updateComment`
- `deleteComment`
- `createLike`
- `deleteLike`
- `createFollow`
- `deleteFollow`
- `markNotificationAsRead`
- `markAllNotificationsAsRead`
- `requestPostMediaUpload`
- `completePostMediaUpload`
- `attachMediaToPost`

### Subscriptions
- `notificationReceived`

## Security and Reliability Techniques Used
- GraphQL JWT guard with `@Public()` opt-out
- GraphQL throttling guard with shared rate-limit categories
- DTO validation at the GraphQL boundary
- service-level Zod parsing where modules follow that pattern
- safe DTO/select exports for public reads
- cursor-based pagination with opaque cursors and bounded page size
- hashed refresh-session tokens with rotation and revocation
- Prisma transactions for consistency-critical updates
- best-effort side effects after committed writes
- version-key cache invalidation instead of wildcard deletes
- fail-fast environment validation
- Redis-backed subscription transport

## Environment Variables
Main required values:
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
R2_ACCOUNT_ID=your_r2_account_id
R2_BUCKET=your_bucket
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_PUBLIC_BASE_URL=https://cdn.example.com
R2_PRESIGNED_URL_TTL_SECONDS=1800
MEDIA_IMAGE_MAX_BYTES=10485760
MEDIA_VIDEO_MAX_BYTES=104857600
```

The authoritative validation source is `src/config/env/env.schema.ts`.

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

4. Start in development:
```bash
npm run start:dev
```

5. Open GraphQL Playground:

- `http://localhost:3000/graphql`

## Docker Setup
This project includes containers for:
- `app`
- `mysql`
- `redis`

### Build and run
```bash
docker compose up --build -d
```

### Logs
```bash
docker compose logs -f app
```

### Stop
```bash
docker compose down
```

To also remove DB/cache volumes:
```bash
docker compose down -v
```

## Available Scripts
- `npm run build` -> builds Nest app and resolves path aliases
- `npm run start` -> runs compiled app
- `npm run start:dev` -> dev mode
- `npm run start:debug` -> debug/watch mode
- `npm run lint` -> lint
- `npm run format` -> Prettier format
- `npm test` -> unit tests

## Project Structure
```text
src/
  auth/            # login + password reset
  comments/        # comment CRUD + post comment reads
  common/          # guards, decorators, constants, filters, args, helpers
  config/          # env schema and config helpers
  follows/         # follow graph
  graphql/         # GraphQL config, middleware, fields, subscriptions
  likes/           # like workflows + counters
  media/           # media upload orchestration and storage integration
  notifications/   # notification persistence + delivery
  posts/           # post CRUD, feed, detail reads, media attachment integration
  prisma/          # Prisma service/module
  users/           # user CRUD + cache helpers
prisma/
  schema.prisma
```

## Design Choices Summary
- Code-first GraphQL to keep the schema aligned with TypeScript declarations
- Safe DTO/select pairing to prevent accidental field leakage
- Service-owned domain logic with thin resolvers
- Denormalized counters for read performance
- Global auth-by-default GraphQL protection
- Shared cursor pagination with `items + pageInfo`
- Read-through caching plus version-key invalidation
- Feature-private helpers where complexity justifies them
- Best-effort side effects after the write path commits
- Redis-backed subscriptions instead of in-memory pubsub

## Current Limitations / Next Priorities
This codebase is already coherent and production-minded, but it is still intentionally smaller than a real social platform. The main current gaps are:

- Feed design is still simple
  - `myFeed` is a bounded relational query, not a scalable feed system
- Structured GraphQL errors may still be flattened at the GraphQL config layer
- Product realism is still limited
  - no privacy controls
  - no blocks / mutes / reports
  - no bookmarks
  - no mentions / hashtags
  - no richer profile domain
  - no session/device management
- Operational maturity is still limited
  - no health checks, metrics, tracing, request correlation, queues, outbox, or workers yet

Current strengths worth preserving:

- Shared cursor-based pagination is now in place across the main list-style modules
  - opaque `createdAt + id` cursors
  - deterministic chronological ordering
  - `items + pageInfo` response shape
- The current feed stays simple but is now placed more cleanly
  - `PostReadService` owns the authenticated feed read path
- Internal module boundaries are better than before
  - `PostReadService`
  - `MediaQueryService`
  - `MediaPolicyService`
  - `NotificationTriggerService`
  - `NotificationDeliveryService`

The strongest next technical platform improvements are:
- preserving structured GraphQL error metadata
- defining a more realistic feed strategy
- adding session/refresh-token lifecycle
- adding moderation and privacy foundations

---

Author: Miguel Lins

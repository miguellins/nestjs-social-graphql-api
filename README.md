# NestJS Social GraphQL API

A production-oriented **social platform backend** built with **NestJS + GraphQL + Prisma + MySQL + Redis**.

This API handles user accounts, authentication, posts, likes, and follows, with strong validation, rate limiting, caching, and consistent error handling.

## What This Project Does

This backend provides the core features of a social application:

- User registration and profile management
- JWT-based authentication (`login`)
- Post creation, listing, detail view, update, and delete
- Like/unlike post behavior with atomic counter updates
- Follow/unfollow user behavior
- Public-safe data exposure (no password leakage)
- Throttling/rate limits per operation type
- Global input validation and error normalization for GraphQL clients

## Stack and Tools

- **Runtime**: Node.js, TypeScript
- **Framework**: NestJS 11
- **API**: GraphQL (code-first) with Apollo driver
- **ORM/DB**: Prisma + MySQL
- **Cache**: Redis via `cache-manager` + `keyv` + `@keyv/redis`
- **Auth**: Passport JWT (`@nestjs/passport`, `@nestjs/jwt`, `passport-jwt`)
- **Security**: `helmet`, global validation pipe, auth guards
- **Validation/Transform**: `class-validator`, `class-transformer`
- **Password Hashing**: `bcrypt`
- **Build/Dev**: Nest CLI, `ts-node`, `nodemon`, `tsc-alias`
- **Code Quality**: ESLint + Prettier

## Architecture Overview

### 1. Application bootstrap (`src/main.ts`)

- Creates Nest app and starts server on `PORT` (default `3000`)
- Enables global `ValidationPipe` with:
  - `whitelist: true`
  - `forbidNonWhitelisted: true`
  - `transform: true`
- Enables a global GraphQL exception filter
- Enables `helmet` headers
- Enables graceful shutdown hooks

### 2. Root module (`src/app.module.ts`)

- Global `ConfigModule`
- Global Redis cache configuration (Keyv + SuperJSON serialization)
- GraphQL code-first schema generation to `src/schema.gql`
- Global throttling with default limits
- Registers all feature modules:
  - `AuthModule`
  - `UsersModule`
  - `PostsModule`
  - `LikesModule`
  - `FollowsModule`
- Registers global guards:
  - `GqlThrottlerGuard`
  - `GqlJwtGuard`

### 3. Data layer

- `PrismaService` extends `PrismaClient`
- `PrismaModule` is global and shared across modules
- MySQL datasource configured through `DATABASE_URL`

## Database Schema (Prisma)

Defined in `prisma/schema.prisma`.

- `User`
  - unique `email`, unique `username`
  - has many `posts`, `likes`, `followers`, `following`
- `Post`
  - belongs to an `author` (`User`)
  - has denormalized `likesCount`
  - indexed by `authorId`
- `Like`
  - belongs to `user` and `post`
  - unique pair `@@unique([userId, postId])`
- `Follow`
  - self-relation (`followerId` -> `followingId`)
  - unique pair `@@unique([followerId, followingId])`

## Feature Modules and Behavior

### Auth

- `login(input)` validates credentials
- Username normalization (`trim + lowercase`)
- Password verification using `bcrypt.compare`
- JWT payload uses `sub: user.id`
- JWT strategy extracts token from Bearer header

### Users

- `users(take)` public list query with pagination cap
- `userById(id)` public detail query
- `createUser(input)` public signup mutation
  - validates and normalizes inputs
  - hashes password with bcrypt (salt rounds = 12)
  - handles unique constraint conflicts (`email`/`username`)
- `updateMe(input)` authenticated profile update
- `deleteMe` authenticated account delete
- Uses Redis cache for:
  - list queries (versioned key strategy)
  - user detail cache

### Posts

- `posts(take, q)` public query with optional text search (`title`/`content`)
- `postById(id)` public detail query, includes recent likes preview
- `createPost(input)` authenticated
- `updatePost(id, input)` authenticated and ownership-protected
- `deletePost(id)` authenticated and ownership-protected
- Uses cache for list/detail and version bumps on writes

### Likes

- `likes(take, postId, userId)` public list query with filters
- `likeById(id)` public detail query
- `createLike(postId)` authenticated
  - transaction: create like + increment post `likesCount`
  - duplicate-like protection via unique constraint
- `deleteLike(id)` authenticated + ownership check
  - transaction: delete like + decrement `likesCount`

### Follows

- `follows(take)` public list query
- `followById(id)` public detail query
- `createFollow(followingId)` authenticated
  - blocks self-follow
  - blocks duplicate follows
- `deleteFollow(id)` authenticated + ownership check

## GraphQL Operations

Main operations exposed in `src/schema.gql`:

### Queries

- `users(take)`
- `userById(id)`
- `posts(take, q)`
- `postById(id)`
- `likes(take, postId, userId)`
- `likeById(id)`
- `follows(take)`
- `followById(id)`

### Mutations

- `login(input)`
- `createUser(input)`
- `updateMe(input)`
- `deleteMe`
- `createPost(input)`
- `updatePost(id, input)`
- `deletePost(id)`
- `createLike(postId)`
- `deleteLike(id)`
- `createFollow(followingId)`
- `deleteFollow(id)`

## Security and Reliability Techniques Used

- JWT auth guard with `@Public()` bypass support
- Role-free ownership checks for sensitive mutations
- Input DTO validation at API boundary
- Input normalization/trim transformers
- Centralized exception mapping (Prisma + HTTP -> predictable GraphQL errors)
- Rate limiting by action type:
  - list, read, signup, mutation, destructive
- Fail-fast env checks (`JWT_SECRET`, `REDIS_URL`)
- Cache invalidation by **versioned keys** (avoids wildcard deletes)
- Use of Prisma transactions for consistency (`Like` + `Post.likesCount` updates)

## Environment Variables

Required values (from `.env`):

```env
PORT=3000
DATABASE_URL=mysql://root:root@localhost:3307/mydb
JWT_SECRET=your_long_secret
JWT_EXPIRES_IN=7d
REDIS_URL=redis://localhost:6379
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Ensure MySQL and Redis are running.

3. Run migrations:

```bash
npx prisma migrate dev
```

4. Start in development:

```bash
npm run start:dev
```

5. Open GraphQL Playground (enabled):

- `http://localhost:3000/graphql`

## Available Scripts

- `npm run build` -> builds Nest app and resolves path aliases
- `npm run start` -> runs compiled app (`dist/main`)
- `npm run start:dev` -> nodemon + ts-node dev mode
- `npm run start:debug` -> Nest debug/watch mode
- `npm run lint` -> lint + auto-fix
- `npm run format` -> Prettier format

## Project Structure (High-Level)

```text
src/
  auth/        # login resolver/service + JWT strategy
  users/       # user CRUD (safe outputs)
  posts/       # post CRUD + search + detail views
  likes/       # likes listing + create/delete with counters
  follows/     # follow graph create/delete/list
  common/      # guards, decorators, constants, filters, args, transformers
  app.module.ts
  main.ts
prisma/
  schema.prisma
  migrations/
```

## Design Choices Summary

- **Code-first GraphQL** to keep schema aligned with TypeScript models
- **Safe DTO/select patterns** to prevent exposing sensitive DB fields
- **Hard pagination caps** to avoid heavy queries
- **Denormalized `likesCount`** for cheap list/read performance
- **Global guard strategy** for secure-by-default API behavior
- **Redis caching** for hot read paths, with explicit invalidation on writes

---

Author: **Miguel Lins**

# Dependencies Reference

## Production Dependencies

---

### `@as-integrations/express5`
Integration layer that bridges Apollo Server with Express 5. Exposes an `expressMiddleware` function that mounts Apollo Server as middleware in an Express 5 app, enabling HTTP-based GraphQL endpoints with support for context injection per request.

---

### `@keyv/redis`
Redis storage adapter for Keyv. Provides a `KeyvRedis` class that connects Keyv's unified key-value API to a Redis instance, enabling persistent or distributed caching backed by Redis.

---

### `@nestjs/apollo`
NestJS driver for Apollo Server. Exports `ApolloDriver` and `ApolloDriverConfig`, used in `GraphQLModule.forRoot()` to configure Apollo as the GraphQL engine — handling schema building, context, plugins, and introspection.

---

### `@nestjs/cache-manager`
NestJS module wrapping `cache-manager`. Exports `CacheModule` for registering a cache store globally or per-module, and `CacheInterceptor` for automatically caching HTTP responses via the `@UseInterceptors` decorator.

---

### `@nestjs/common`
Core utilities for building NestJS modules. Provides decorators (`@Module`, `@Injectable`, `@Controller`, `@Get`, `@Post`, `@Body`, `@Param`, `@Query`, `@UseGuards`, `@UseInterceptors`), pipes (`ValidationPipe`, `ParseIntPipe`), exceptions (`HttpException`, `NotFoundException`, `ForbiddenException`), and interfaces for guards, interceptors, pipes, and middleware.

---

### `@nestjs/config`
Environment configuration module for NestJS. Exports `ConfigModule.forRoot()` to load `.env` files via `dotenv`, and `ConfigService` for typed access to environment variables anywhere in the app through dependency injection.

---

### `@nestjs/core`
The NestJS runtime kernel. Provides `NestFactory.create()` to bootstrap the application, the dependency injection container, module lifecycle hooks, and the request pipeline engine. Required for every NestJS app.

---

### `@nestjs/graphql`
GraphQL integration module for NestJS. Provides decorators for the code-first approach: `@Resolver`, `@Query`, `@Mutation`, `@Subscription`, `@Args`, `@Field`, `@ObjectType`, `@InputType`, `@ResolveField`. Also exports `GraphQLModule` for schema configuration.

---

### `@nestjs/jwt`
JWT utilities for NestJS. Exports `JwtModule.register()` for configuring secret/algorithm/expiration, and `JwtService` with `sign()`, `verify()`, and `decode()` methods for creating and validating JSON Web Tokens.

---

### `@nestjs/passport`
Passport.js integration for NestJS. Exports `PassportModule` for registering authentication strategies and `AuthGuard('strategy-name')` for protecting routes/resolvers. Also provides `PassportStrategy` base class for defining custom strategies.

---

### `@nestjs/platform-express`
Express HTTP adapter for NestJS. Exports `ExpressAdapter` allowing NestJS to run on Express under the hood, and re-exports Express types for middleware and request/response objects.

---

### `@nestjs/throttler`
Rate limiting module for NestJS. Exports `ThrottlerModule.forRoot()` to configure request limits (TTL and limit count), `ThrottlerGuard` to apply rate limiting globally or per-route, and `@SkipThrottle` / `@Throttle` decorators for fine-grained control.

---

### `@prisma/client`
Auto-generated type-safe database client from your Prisma schema. Exports `PrismaClient` with methods for every model (e.g., `prisma.user.findMany()`, `prisma.post.create()`), full TypeScript types for all models, and support for transactions, raw queries, and middleware.

---

### `bcrypt`
Password hashing library. Key functions: `bcrypt.hash(password, saltRounds)` to hash a plain-text password, and `bcrypt.compare(plain, hash)` to verify a password against its hash. Uses the bcrypt adaptive algorithm, making brute-force attacks computationally expensive.

---

### `cache-manager`
Unified caching API. Exports `caching()` to create a cache store instance (in-memory, Redis, etc.) with `get(key)`, `set(key, value, ttl)`, `del(key)`, and `reset()` methods. Used by `@nestjs/cache-manager` as its underlying engine.

---

### `class-transformer`
Transforms plain JavaScript objects into class instances and vice versa. Key functions: `plainToInstance(Class, object)` converts a raw object to a typed class instance, and `instanceToPlain(instance)` serializes it back. Uses `@Expose`, `@Exclude`, and `@Type` decorators to control field visibility and nested type mapping. Integrates with NestJS's `ValidationPipe`.

---

### `class-validator`
Declarative validation via decorators on DTO classes. Provides decorators like `@IsString()`, `@IsEmail()`, `@IsInt()`, `@MinLength()`, `@IsOptional()`, `@IsEnum()`, and `@ValidateNested()`. Works with `class-transformer` and NestJS's `ValidationPipe` to automatically validate incoming request bodies.

---

### `graphql`
The core GraphQL runtime for JavaScript. Provides schema definition utilities (`buildSchema`, `GraphQLSchema`, `GraphQLObjectType`), query execution (`execute`, `parse`, `validate`), and type system primitives. Required peer dependency for `@nestjs/graphql` and Apollo Server.

---

### `graphql-query-complexity`
Middleware/plugin for measuring and limiting GraphQL query complexity. Exports `createComplexityRule()` and complexity estimators (`fieldExtensionsEstimator`, `simpleEstimator`) that can be added to Apollo Server's validation rules to reject queries that exceed a configured complexity threshold, preventing expensive nested queries from reaching resolvers.

---

### `graphql-subscriptions`
In-memory pub/sub engine for GraphQL subscriptions. Exports `PubSub` with `publish(triggerName, payload)` and `asyncIterableIterator(triggerName)` methods. Used in resolvers decorated with `@Subscription` to push real-time events to subscribed clients.

---

### `graphql-ws`
WebSocket-based transport for GraphQL subscriptions following the `graphql-ws` protocol. Used by Apollo Server and NestJS GraphQL to handle WebSocket connections for subscriptions, replacing the older `subscriptions-transport-ws`.

---

### `helmet`
Express middleware that sets security-related HTTP headers. Configures headers such as `Content-Security-Policy`, `X-Content-Type-Options`, `Strict-Transport-Security`, and `X-Frame-Options` to protect against common web vulnerabilities like XSS and clickjacking. Applied with `app.use(helmet())`.

---

### `keyv`
Simple, unified key-value storage with support for multiple backends (in-memory, Redis, SQLite, etc.). Core API: `new Keyv(options)`, `.set(key, value, ttl?)`, `.get(key)`, `.delete(key)`, `.clear()`. Used as the storage layer beneath `cache-manager` when paired with `@keyv/redis`.

---

### `nodemon`
Development utility that watches your source files and automatically restarts the Node.js process when changes are detected. Configured via `nodemon.json` or the `nodemon` key in `package.json`. Typically used in the `start:dev` npm script.

---

### `passport`
Authentication middleware for Node.js. Provides a plugin-based `authenticate(strategy)` middleware, `serializeUser`/`deserializeUser` session hooks, and an extensible strategy interface. In NestJS it is wrapped by `@nestjs/passport` and not used directly.

---

### `passport-jwt`
Passport strategy for authenticating via JSON Web Tokens. Exports `Strategy` and `ExtractJwt` (with helpers like `ExtractJwt.fromAuthHeaderAsBearerToken()`). Extended via `PassportStrategy` from `@nestjs/passport` to validate the JWT payload and return the authenticated user.

---

### `prisma`
The Prisma CLI and migration engine (dev/runtime tool). Provides `prisma migrate dev`, `prisma migrate deploy`, `prisma db push`, `prisma generate` (regenerates `@prisma/client`), and `prisma studio` (visual DB browser). Used at development time and during CI/CD deployment.

---

### `reflect-metadata`
Polyfill for the TC39 Metadata Reflection API. Required by TypeScript's `emitDecoratorMetadata` feature, which NestJS and `class-transformer`/`class-validator` depend on to read type information at runtime from decorators. Must be imported once at the application entry point (`import 'reflect-metadata'`).

---

### `rxjs`
Reactive Extensions library for JavaScript. NestJS uses Observables (`Observable`, `Subject`, `BehaviorSubject`) as the return type for interceptors, guards, and exception filters. Key operators used in NestJS: `map`, `catchError`, `tap`, `switchMap`, `from`, `of`. Also used for lifecycle events via `EventEmitter2`.

---

### `superjson`
Extended JSON serializer that preserves JavaScript types that plain JSON cannot (e.g., `Date`, `Map`, `Set`, `BigInt`, `undefined`, `RegExp`). Exports `superjson.serialize(value)` and `superjson.deserialize(data)`. Useful for API responses or cache values that include `Date` objects.

---

### `zod`
TypeScript-first schema declaration and validation library. Define schemas with `z.object()`, `z.string()`, `z.number()`, `z.enum()`, etc., then validate with `.parse(data)` (throws on failure) or `.safeParse(data)` (returns `{ success, data, error }`). Schemas automatically infer their TypeScript types via `z.infer<typeof schema>`.

---

## Dev Dependencies

---

### `@eslint/eslintrc` / `@eslint/js`
ESLint configuration utilities for the flat config system (`eslint.config.js`). `@eslint/js` provides `js.configs.recommended` — a preset of recommended JS linting rules. `@eslint/eslintrc` provides `FlatCompat` for migrating legacy `.eslintrc` configs to the flat config format.

---

### `@nestjs/cli`
NestJS command-line tool. Provides `nest new`, `nest generate` (scaffolds modules, services, controllers, resolvers, guards, etc.), `nest build`, and `nest start`. Essential for project scaffolding and consistent code generation.

---

### `@nestjs/schematics`
Code generation blueprints used by `@nestjs/cli`. Contains the templates that `nest generate` uses to scaffold files. Not invoked directly.

---

### `@nestjs/testing`
Testing utilities for NestJS. Exports `Test.createTestingModule()` to bootstrap a lightweight NestJS module in tests, allowing dependency injection to work the same way as in production while providing `overrideProvider()` and `overrideGuard()` to inject mocks.

---

### `@types/bcrypt` / `@types/express` / `@types/node` / `@types/passport-jwt` / `@types/supertest` / `@types/jest`
TypeScript declaration files providing type definitions for `bcrypt`, `express`, Node.js built-ins (`fs`, `path`, `process`, etc.), `passport-jwt`, `supertest`, and `jest` respectively. Used only at compile time; not included in the production bundle.

---

### `eslint`
The core JavaScript/TypeScript linter. Statically analyses code for errors, style violations, and potential bugs based on configured rules. Run via `eslint .` or as a pre-commit hook.

---

### `eslint-config-prettier`
Disables ESLint formatting rules that conflict with Prettier. Included last in the ESLint config's `extends` array so it overrides any formatting rules from other configs.

---

### `eslint-plugin-import`
ESLint plugin that validates ES module import/export syntax. Enforces rules like `import/no-unresolved`, `import/order`, `import/no-duplicates`, and `import/no-cycle` to keep module boundaries clean.

---

### `eslint-plugin-prettier`
Runs Prettier as an ESLint rule, reporting formatting differences as ESLint errors. Allows a single `eslint --fix` command to both lint and format the codebase.

---

### `globals`
Provides predefined sets of global variables (`globals.browser`, `globals.node`, `globals.jest`, etc.) for use in ESLint's flat config `languageOptions.globals` field, preventing false "no-undef" errors for environment-specific globals.

---

### `jest`
JavaScript test runner. Provides `describe`, `it`/`test`, `expect`, `beforeEach`, `afterEach`, `beforeAll`, `afterAll`, mocking utilities (`jest.fn()`, `jest.spyOn()`, `jest.mock()`), and coverage reporting. Configured in `jest.config.ts` or the `jest` key in `package.json`.

---

### `prettier`
Opinionated code formatter. Enforces a consistent code style (indentation, quotes, trailing commas, line length) across the entire codebase. Run via `prettier --write .` or integrated through `eslint-plugin-prettier`.

---

### `supertest`
HTTP assertion library for testing Express/NestJS apps. Exports `request(app)` which returns a fluent API for making real HTTP calls to your app in tests (`.get()`, `.post()`, `.set()`, `.expect(statusCode)`, `.expect(body)`), without needing a live server.

---

### `ts-jest`
Jest transformer that compiles TypeScript on the fly during test runs. Configured in `jest.config.ts` under `transform: { '^.+\\.ts$': 'ts-jest' }`. Eliminates the need for a separate build step before running tests.

---

### `ts-node`
TypeScript execution engine for Node.js. Compiles and runs `.ts` files directly without a prior `tsc` build step. Used by NestJS CLI (`nest start`) in development and for scripts like `prisma/seed.ts`.

---

### `tsc-alias`
Post-processor for TypeScript path alias resolution. After `tsc` compiles your code, `tsc-alias` rewrites the compiled `.js` import paths so that TypeScript path aliases (e.g., `@/modules/...`) resolve correctly in the emitted JavaScript output.

---

### `tsconfig-paths`
Runtime resolver for TypeScript path aliases. Hooks into Node.js's module resolution at runtime (via `ts-node` or `node -r tsconfig-paths/register`) so that aliased imports like `@/common/...` work without needing a build step.

---

### `typescript`
The TypeScript compiler (`tsc`). Performs static type checking and compiles `.ts` files to `.js`. Configured via `tsconfig.json`. Also powers IDE IntelliSense and type inference across the entire project.

---

### `typescript-eslint`
Monorepo package that provides the TypeScript ESLint parser (`@typescript-eslint/parser`) and rules (`@typescript-eslint/eslint-plugin`). Enables ESLint to understand TypeScript syntax and enforces TypeScript-specific rules like `no-explicit-any`, `explicit-function-return-type`, and `no-floating-promises`.
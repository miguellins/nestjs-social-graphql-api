Create a prompt for codex to check if my project is following all best practices. Ask to do it carefully, without changing anything that is not required.

I checked the official Prisma docs and the Prisma 6.19.2 release note. One important nuance: **6.19.2 is a patch release**, and its release note says it mainly fixes an Accelerate edge-runtime issue when `@prisma/client/edge` is not used. The broader best-practice guidance lives in Prisma’s docs, and Prisma’s current docs still call out **v6-specific behavior** where it matters, especially for connection settings and migration workflows.

I can’t guarantee this is literally every sentence across the entire Prisma docs corpus, but this is the **main official checklist of best practices and security measures relevant to Prisma ORM 6.19.2**.

## Best practices

1. **Keep secrets out of the schema and code**
   Use `env()` for datasource URLs and other config instead of hardcoding credentials. Prisma explicitly says hardcoding URLs in the schema is discouraged because it poses a security risk, and its deployment docs recommend keeping `DATABASE_URL` as a CI/repository secret rather than storing production DB URLs locally.

2. **Use the right migration workflow for the environment**
   In development, use `prisma migrate dev`; use `prisma db push` only for quick prototyping. In production, Prisma recommends using only `prisma migrate deploy` with committed migrations, and says `migrate dev` and `db push` should not be used there because they can reset data or be destructive. Prisma also notes that `migrate deploy` is non-interactive, uses advisory locking, and is safe for production data.

3. **Create one global `PrismaClient` and reuse it**
   Prisma recommends one shared `PrismaClient` instance per application process. Creating multiple clients creates multiple connection pools, which can exhaust database connection limits and slow queries. In most cases you do not need to call `$connect()` or `$disconnect()` manually because Prisma connects on first query, creates a pool, and disconnects when the Node process ends.

4. **Handle serverless differently**
   For serverless, Prisma recommends instantiating `PrismaClient` outside the handler so warm invocations can reuse it, and specifically says not to call `$disconnect()` at the end of each invocation. Prisma also recommends considering an external pooler like PgBouncer for high-concurrency workloads, because each function instance can otherwise create its own pool.

5. **Tune connection pooling consciously**
   Prisma documents v6 pool defaults and URL parameters such as `connection_limit`, `pool_timeout`, `connect_timeout`, and `max_idle_connection_lifetime`. It also says the pool size cannot exceed what the database can support, and that this becomes especially important in serverless deployments.

6. **Model relations explicitly**
   Prisma recommends defining both sides of relations explicitly to keep the schema clear and maintainable. It also notes that on databases that do not enforce foreign keys, Prisma emulates relations, so you should manually add indexes on relation scalar fields to avoid full table scans.

7. **Index fields used in `where`, `orderBy`, and relations**
   Prisma’s best-practices page says to index fields used in `where`, `orderBy`, and relations, because otherwise the database may scan entire tables as data grows. Prisma’s schema docs also document `@unique`, `@@unique`, and `@@index` support.

8. **Use enums for finite domains; use strings for user-generated or fast-changing values**
   Prisma recommends enums when the values are a fixed, type-safe set, and says `String` is a better fit when values change frequently or are user-generated.

9. **Use a multi-file schema for larger projects**
   Prisma says multi-file schema organization has been available since v6.7.0 and recommends it for larger projects, with `schema.prisma` and `migrations/` kept at the same level.

10. **Prevent N+1 queries**
    Prisma’s official recommendation is to avoid N+1 patterns by either fetching related data with `include` or batching follow-up queries with an `IN` filter instead of querying once per record.

11. **Select only what you need**
    Prisma says that by default it returns all scalar fields, so you should use `select` to whitelist only the fields you need. It also supports `omit` to exclude fields, which is especially useful for sensitive data.

12. **Choose pagination style based on scale**
    Prisma recommends offset pagination for small datasets where arbitrary page jumps matter, and cursor-based pagination for large datasets or infinite scroll because cursor pagination scales better on indexed columns.

13. **Use bulk operations for bulk work**
    Prisma recommends `createMany`, `createManyAndReturn`, `updateMany`, `updateManyAndReturn`, and `deleteMany` when operating on multiple records, and notes that these bulk operations automatically run as transactions.

14. **Prefer generated Prisma types over hand-written duplicates**
    Prisma recommends using the generated types from Prisma Client instead of duplicating interfaces. Its type-safety docs also note that Prisma Client provides full type safety for queries, including partial queries and included relations.

15. **Validate and sanitize input before database calls**
    Prisma’s best-practices page explicitly says to always validate and sanitize user input before database operations. Prisma’s examples use a schema validator such as Zod before passing data into Prisma calls.

16. **Use the Prisma query API first; reach for raw SQL only when needed**
    Prisma recommends preferring its normal query API, and its raw SQL docs recommend TypedSQL for type-safe SQL when you need custom SQL. Raw queries are meant for cases where Prisma Client does not support a feature yet or when you need a heavily optimized query.

17. **Use the right transaction primitive for the right problem**
    Prisma recommends nested writes for dependent writes, because they roll back the whole unit if any step fails. For independent writes, use `$transaction([])`. For read-modify-write flows, Prisma’s docs point to designing idempotent APIs or implementing optimistic concurrency control.

18. **Handle concurrent writes intentionally**
    Prisma documents transaction isolation levels and recommends using `Serializable` plus retry logic for `P2034` errors when you need to avoid write conflicts or deadlocks under concurrency. It also documents optimistic concurrency control using a version or timestamp field for high-concurrency scenarios where conflicts are rare.

19. **Use logging and tracing for observability**
    Prisma supports stdout logging, event-based logging through `$on()`, and OpenTelemetry tracing for query-level performance visibility. These are recommended for diagnosing slow queries and operational issues.

20. **Test against a dedicated test database**
    Prisma recommends a test database that can be reset freely, with a workflow of applying schema, seeding, running tests, and cleaning up. It also documents mocking `PrismaClient` for unit tests and using a real database for integration tests.

## Security measures

1. **Do not hardcode credentials**
   Use environment variables for datasource URLs and store production `DATABASE_URL` values in secret stores or CI secrets. Prisma explicitly frames hardcoded URLs as a security risk.

2. **Treat raw SQL as the main Prisma security risk**
   Prisma says its normal API is safe by default, but raw queries require care. `$queryRawUnsafe` and `$executeRawUnsafe` significantly increase SQL injection risk, and even `$queryRaw`/`$executeRaw` can become unsafe if you build strings incorrectly or misuse `Prisma.raw`.

3. **Use parameterized/tagged raw queries only**
   Prisma says the safe pattern is tagged templates or parameterized queries, because Prisma escapes variables and sends prepared statements. Never concatenate user input into SQL strings.

4. **Do not interpolate identifiers into raw queries**
   Prisma documents that template variables can only be used for data values, not for identifiers such as table names, column names, database names, or SQL keywords. If you end up using dynamic identifiers via `Unsafe` methods, user input there is a SQL injection risk.

5. **Exclude sensitive fields from results**
   Prisma recommends using `omit` globally on the client or per query to keep sensitive fields out of returned objects. That is one of Prisma’s explicit security best practices.

6. **Validate and sanitize before persistence**
   Prisma’s own best-practices page treats input validation and sanitization as part of the secure path before database writes. Prisma’s type safety helps, but it is not a substitute for runtime validation of untrusted input.

7. **Use production-safe migration workflows**
   Prisma recommends automated `migrate deploy` in CI/CD with the database URL stored as a secret. It also says it is not generally good practice to store the production database URL locally.

## Best short checklist for your Prisma 6.19.2 project

If you want the highest-value set to follow immediately:

- keep `DATABASE_URL` and other secrets in env/secret stores, never in schema or code
- use one shared `PrismaClient`, and for serverless create it outside the handler without per-request disconnects
- use `migrate dev` only in development and `migrate deploy` only in production CI/CD
- add indexes for `where`, `orderBy`, and relation fields; use cursor pagination for large lists
- use `select`/`omit` to avoid overfetching and to hide sensitive fields
- validate and sanitize all untrusted input before Prisma calls
- avoid raw SQL unless necessary; when unavoidable, use tagged templates or parameterized queries and never string concatenation with user input
- use nested writes or transactions correctly, and add retry logic for `P2034` on concurrent write conflicts

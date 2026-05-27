# Prisma Module

The Prisma module owns the shared Prisma client provider used by feature services and infrastructure collaborators.

## What this module covers

- one shared `PrismaService`
- startup database connection
- shutdown database disconnection
- Prisma query metric recording
- low-cardinality Prisma error outcome mapping

## Important behavior

- `PrismaModule` is global
- feature services should reuse `PrismaService`
- do not create ad hoc Prisma clients or extra connection pools
- Prisma query metrics are recorded through the extended client
- known Prisma errors are mapped to stable metric outcome buckets

## Migration Rules

Prisma schema changes belong in `prisma/schema.prisma` unless migration work is explicitly requested.

Agents must not edit, create, delete, rename, or rewrite files under `prisma/migrations/` unless the user explicitly asks for migration work.

## Service ownership

- `PrismaService` owns connection lifecycle and Prisma query metric instrumentation.

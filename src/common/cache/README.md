# Cache Helpers Module

The cache helpers module provides the shared cache helper used by feature services.

## What this module covers

- read-through cache helpers
- deterministic cache get/set/delete wrappers
- version-key helpers for list invalidation
- cache metrics recording through shared infrastructure

## Important behavior

- feature services should use `CacheHelperService` instead of calling the cache manager directly
- list invalidation should use version-key bumps
- detail invalidation should delete targeted detail keys
- wildcard cache deletion is not allowed

## Service ownership

- `CacheHelperService` owns cache access patterns used by feature modules.

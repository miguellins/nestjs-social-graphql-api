import { Inject, Injectable, Logger } from "@nestjs/common";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";

import { runBestEffort } from "@/common/errors/run-best-effort";

@Injectable()
export class CacheHelperService {
  private readonly logger = new Logger(CacheHelperService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /**
   * Retrieves a value from cache by key
   *
   * Returns:
   * - The cached value if present
   * - undefined if the key does not exist
   *
   * Why explicit get():
   * - Clear separation between read and write operations
   * - Useful for conditional logic in services
   */
  async get<T>(key: string): Promise<T | undefined> {
    return (await this.cache.get<T>(key)) ?? undefined;
  }

  /**
   * Stores a value in cache with a defined TTL
   *
   * Parameters:
   * - key: unique cache key
   * - value: data to store
   * - ttlMs: expiration time in milliseconds
   */
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.cache.set(key, value, ttlMs);
  }

  /**
   * Deletes a specific cache key
   *
   * Used for:
   * - Detail-level invalidation
   * - Removing stale entity data after mutation
   */
  async del(key: string): Promise<void> {
    await this.cache.del(key);
  }

  /**
   * Read-through caching helper
   *
   * Flow:
   * 1. Attempt to read from cache
   * 2. If present → return immediately (cache hit)
   * 3. If absent → execute factory (usually DB query)
   * 4. Store result in cache
   * 5. Return fresh result
   *
   * T = inferred return type of factory
   *
   * This centralizes the classic "cache → DB fallback → cache set" pattern
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);

    if (cached !== undefined) return cached;

    const data = await factory();

    // Keep cache population failures from masking a successful factory result
    await runBestEffort(
      this.logger,
      "error",
      `Failed to populate cache for key ${key}`,
      async () => {
        await this.set(key, data, ttlMs);
      },
    );

    return data;
  }

  /**
   * Retrieves the current version number for a version key
   *
   * Version keys are used to invalidate entire groups of list caches without
   * deleting individual keys
   *
   * Defaults to version 1 if not initialized
   */
  async getVersion(versionKey: string): Promise<number> {
    const v = await this.get<number>(versionKey);
    return v ?? 1;
  }

  /**
   * Increments a version key
   *
   * Effect:
   * - All previously cached list keys using the old version become instantly unreachable
   *
   * Why version-based invalidation?
   * - Avoids deleting multiple keys manually
   * - O(1) invalidation cost
   * - Scales well in Redis clusters
   *
   * TTL is intentionally long to prevent accidental expiration, which would reset
   * versioning and potentially revive stale data
   */
  async bumpVersion(versionKey: string): Promise<void> {
    const v = await this.getVersion(versionKey);

    await this.set(
      versionKey,
      v + 1,
      365 * 24 * 60 * 60_000, // 1 year TTL
    );
  }
}

import { CACHE_MANAGER, Cache } from "@nestjs/cache-manager";
import { Inject, Injectable } from "@nestjs/common";

/**
 * CacheHelperService
 *
 * Centralized infrastructure service responsible for handling application-level
 * caching logic
 *
 * Why this exists:
 * - Avoid duplicating cache logic across Posts, Users, Likes, etc
 * - Provide a reusable read-through caching pattern (getOrSet)
 * - Provide scalable list invalidation using version keys
 * - Encapsulate direct interaction with the NestJS CacheManager
 *
 * Architectural Role:
 * - This is an infrastructure utility (not business logic)
 * - It abstracts cache access (memory or Redis)
 * - It allows services to remain clean and focused on domain logic
 *
 * Patterns Implemented:
 * - Read-through caching
 * - Version-based list invalidation
 * - Detail-level key deletion
 */

@Injectable()
export class CacheHelperService {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  // Generic read-through caching helper
  // T = the type of data being cached (Post[], User, Like[], etc.)
  async getOrSet<T>(
    // Unique cache key (ex: "posts:list:v1:10:all")
    key: string,

    // Function that fetches fresh data if cache misses
    factory: () => Promise<T>,

    // Time-to-live in milliseconds
    ttlMs: number,

    // Returns the same type the factory returns
  ): Promise<T> {
    // Try to retrieve cached value from cache store (memory or Redis)
    const cached = await this.cache.get<T>(key);

    // If cached data exists, immediately return it
    // This avoids hitting the database and improves performance
    if (cached) return cached;

    // If cache miss, execute the factory function
    // This typically performs a database query
    const data = await factory();

    // Store the freshly fetched data in cache
    // It will expire automatically after ttlMs
    await this.cache.set(key, data, ttlMs);

    return data;
  }

  // Increments a version key used to invalidate multiple list cache keys
  async bumpVersion(versionKey: string): Promise<void> {
    // Retrieve current version number from cache, if doesnt exist yet, default to 1
    const v = (await this.cache.get<number>(versionKey)) ?? 1;

    // Store incremented version back into cache
    // Any cache keys using the old version become instantly obsolete
    await this.cache.set(versionKey, v + 1, 365 * 24 * 60 * 60_000);
  }

  // Retrieves the current version number for a given version key
  async getVersion(versionKey: string): Promise<number> {
    // Return stored version number, or default to 1
    return (await this.cache.get<number>(versionKey)) ?? 1;
  }

  // Deletes a specific cache key
  async del(key: string): Promise<void> {
    // Removes the cache enty completely
    // Used for detail-level invalidation (ex: posts:detail:15)
    await this.cache.del(key);
  }
}

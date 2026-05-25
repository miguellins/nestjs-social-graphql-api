import { Inject, Injectable, Logger } from "@nestjs/common";
import { CACHE_MANAGER, type Cache } from "@nestjs/cache-manager";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { TracingService } from "@/tracing/tracing.service";

@Injectable()
export class CacheHelperService {
  private readonly logger = new Logger(CacheHelperService.name);

  constructor(
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly metricsRegistry: MetricsRegistryService,
    private readonly tracingService: TracingService,
  ) {}

  /** Retrieves a value from cache by key and records hit, miss, or error. */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = (await this.cache.get<T>(key)) ?? undefined;
      this.recordCacheOperation("get", value === undefined ? "miss" : "hit");
      return value;
    } catch (error) {
      this.recordCacheOperation("get", "error");
      throw error;
    }
  }

  /** Stores a value in cache with a defined TTL and records write or error. */
  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttlMs);
      this.recordCacheOperation("set", "write");
    } catch (error) {
      this.recordCacheOperation("set", "error");
      throw error;
    }
  }

  /** Deletes a specific cache key and records write or error. */
  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
      this.recordCacheOperation("del", "write");
    } catch (error) {
      this.recordCacheOperation("del", "error");
      throw error;
    }
  }

  /** Confirms the cache backend can complete a minimal write-read-delete cycle without metric noise. */
  async ping(): Promise<void> {
    const key = `health:cache:${Date.now()}`;
    const value = "ok";

    await this.cache.set(key, value, 5_000);

    const stored = await this.cache.get<string>(key);

    if (stored !== value) {
      throw new Error("Cache ping returned an unexpected value");
    }

    await this.cache.del(key);
  }

  /** Reads through cache, populates misses, and records get_or_set hit, miss, write, or error. */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    if (this.tracingService.isCurrentTraceSampled()) {
      return this.tracingService.startActiveSpan(
        "cache.get_or_set",
        { "cache.operation": "get_or_set" },
        () => this.getOrSetWithoutSpan(key, factory, ttlMs),
      );
    }

    return this.getOrSetWithoutSpan(key, factory, ttlMs);
  }

  /** Executes read-through cache behavior without adding another manual span. */
  private async getOrSetWithoutSpan<T>(
    key: string,
    factory: () => Promise<T>,
    ttlMs: number,
  ): Promise<T> {
    let cached: T | undefined;

    try {
      cached = (await this.cache.get<T>(key)) ?? undefined;
    } catch (error) {
      this.recordCacheOperation("get_or_set", "error");
      throw error;
    }

    if (cached !== undefined) {
      this.recordCacheOperation("get_or_set", "hit");
      return cached;
    }

    this.recordCacheOperation("get_or_set", "miss");
    const data = await factory();

    // Keep cache population failures from masking a successful factory result.
    await runBestEffort(
      this.logger,
      "error",
      `Failed to populate cache for key ${key}`,
      async () => {
        try {
          await this.cache.set(key, data, ttlMs);
          this.recordCacheOperation("get_or_set", "write");
        } catch (error) {
          this.recordCacheOperation("get_or_set", "error");
          throw error;
        }
      },
    );

    return data;
  }

  /** Retrieves the current version number for a version key, defaulting to one. */
  async getVersion(versionKey: string): Promise<number> {
    const v = await this.get<number>(versionKey);
    return v ?? 1;
  }

  /** Increments a version key to invalidate a list cache namespace. */
  async bumpVersion(versionKey: string): Promise<void> {
    const v = await this.getVersion(versionKey);

    await this.set(
      versionKey,
      v + 1,
      365 * 24 * 60 * 60_000, // 1 year TTL
    );
  }

  /** Records cache metrics defensively so instrumentation never changes cache behavior. */
  private recordCacheOperation(
    operation: "del" | "get" | "get_or_set" | "set",
    result: "error" | "hit" | "miss" | "write",
  ): void {
    try {
      this.metricsRegistry.incrementCacheOperation(operation, result);
    } catch {
      // Metrics must never affect cache behavior.
    }
  }
}

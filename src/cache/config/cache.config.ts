import type { CacheModuleAsyncOptions } from "@nestjs/cache-manager";
import { ConfigService } from "@nestjs/config";

import SuperJSON from "superjson";

import KeyvRedis from "@keyv/redis";
import Keyv from "keyv";

/**
 * Async CacheModule configuration for the application's global Redis-backed cache
 *
 * Builds a Keyv store on top of Redis and uses SuperJSON so cached values keep
 * richer JavaScript types while remaining portable across cache reads/writes
 */

export const cacheModuleConfig: CacheModuleAsyncOptions = {
  isGlobal: true,
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const redisUrl = config.get<string>("REDIS_URL");

    if (!redisUrl) throw new Error("REDIS_URL is not defined");

    const redis = new KeyvRedis(redisUrl);

    const keyv = new Keyv({
      store: redis,
      namespace: "app-cache",
      serialize: (data) => SuperJSON.stringify(data),
      deserialize: (data) => SuperJSON.parse(data),
    });

    return {
      stores: [keyv],
      ttl: 30_000,
    };
  },
};

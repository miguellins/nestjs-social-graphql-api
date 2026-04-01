import type { CacheModuleAsyncOptions } from "@nestjs/cache-manager";
import { ConfigService } from "@nestjs/config";

import SuperJSON from "superjson";

import KeyvRedis from "@keyv/redis";
import Keyv from "keyv";

/** Async NestJS cache module config using Keyv+Redis with SuperJSON serialization. */
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

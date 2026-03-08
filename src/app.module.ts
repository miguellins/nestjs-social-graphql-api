import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { ThrottlerModule } from "@nestjs/throttler";
import { GraphQLModule } from "@nestjs/graphql";
import { APP_GUARD } from "@nestjs/core";
import { Module } from "@nestjs/common";

import { GqlThrottlerGuard } from "@/common/guards/qgl-throttler.guard";
import { GqlJwtGuard } from "@/common/guards/qgl-jwt.guard";

import { FollowsModule } from "@/follows/follows.module";
import { UsersModule } from "@/users/users.module";
import { PostsModule } from "@/posts/posts.module";
import { LikesModule } from "@/likes/likes.module";
import { AuthModule } from "@/auth/auth.module";

import type { GraphQLFormattedError } from "graphql";

import type { Request, Response } from "express";

import KeyvRedis from "@keyv/redis";
import Keyv from "keyv";

import SuperJSON from "superjson";

import { join } from "path";

export type GqlContext = {
  req: Request;
  res: Response;
};

@Module({
  imports: [
    // Loads and exposes environment variables globally
    ConfigModule.forRoot({ isGlobal: true }),

    /**
     * Configures a global Redis-backed cache using NestJS CacheModule
     *
     * The factory function reads runtime configuration from ConfigService
     * and initializes a Redis-backed Keyv store for application-wide caching
     *
     * Initialization flow:
     * - Reads REDIS_URL from the environment and fails fast if undefined,
     *   preventing silent fallback to in-memory caching
     * - Creates a KeyvRedis adapter to establish the connection to Redis
     * - Wraps the adapter in a Keyv instance scoped to the "app-cache"
     *   namespace, ensuring all keys are isolated and collision-safe
     *   within shared Redis environments
     *
     * Default behavior:
     * - Cached entries expire after 30 seconds unless explicitly overridden
     * - Expiration is handled automatically by Redis
     *
     * Architectural intent:
     * - Centralized cache configuration
     * - Deterministic key isolation
     * - Production-safe fail-fast behavior
     */
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>("REDIS_URL");

        if (!redisUrl) throw new Error("REDIS_URL is not defined");

        // Establishes a direct connection to the REDIS server via its URL
        const redis = new KeyvRedis(redisUrl);

        // Wraps the Redis adapter with a namespaced Keyv store to isolate cache keys and
        // prevent collisions across services or environments
        const keyv = new Keyv({
          store: redis,
          namespace: "app-cache",

          // Serialization to support complex types (Date)
          serialize: (data) => SuperJSON.stringify(data),
          deserialize: (data) => SuperJSON.parse(data),
        });

        return {
          stores: [keyv],

          // Default cache expiration in milliseconds
          ttl: 30_000,
        };
      },
    }),

    // Initializes GraphQL globally
    GraphQLModule.forRoot<ApolloDriverConfig>({
      // Uses ApolloDriverConfig for type safety
      driver: ApolloDriver,

      // Set code-first approach
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),

      // Customizes how errors are presented to the GraphQL client
      formatError: (error: GraphQLFormattedError) => ({
        message: error.message,
      }),

      // Injects the HTTP request and response into the GraphQL context
      context: ({ req, res }: { req: Request; res: Response }): GqlContext => ({
        req,
        res,
      }),

      debug: false,

      playground: true,
    }),

    // Registers the rate limiter globally
    ThrottlerModule.forRoot([
      {
        // 60 seconds (ms)
        ttl: 60,

        // 100 requests per ttl per client
        limit: 120,
      },
    ]),

    // Application Modules
    UsersModule,
    PostsModule,
    LikesModule,
    FollowsModule,
    AuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: GqlJwtGuard,
    },
  ],
})
export class AppModule { }

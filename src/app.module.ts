import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { ThrottlerModule } from "@nestjs/throttler";
import { GraphQLModule } from "@nestjs/graphql";
import { JwtService } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { Module } from "@nestjs/common";

import { createQueryComplexityPlugin } from "@/graphql/plugins/query-complexity.plugin";

import { GqlThrottlerGuard } from "@/common/guards/qgl-throttler.guard";
import { GqlJwtGuard } from "@/common/guards/qgl-jwt.guard";

import { NotificationsModule } from "@/notifications/notifications.module";
import { CommentsModule } from "@/comments/comments.module";
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

/**
 * Extra data attached to a GraphQL WebSocket subscription connection
 *
 * This object lives on `context.extra` for subscription operations and stores
 * connection-scoped metadata, such as the authenticated user resolved during
 * the WebSocket handshake
 */
export type SubscriptionExtra = {
  // Authenticated user attached during the WebSocket connection handshake
  user?: {
    // Unique identifier of the authenticated user
    id: number;
  };

  // Allows attaching other connection-scoped metadata later if needed
  [key: string]: unknown;
};

/**
 * GraphQL execution context passed to resolvers and middleware
 *
 * Supports both HTTP (req/res) and WebSocket (extra) transports, enabling a
 * unified context shape across queries, mutations, and subscriptions
 */
export type GqlContext = {
  // Incoming HTTP request object. Present in query/mutation context
  req?: Request;

  // Outgoing HTTP response object. Present in query/mutation context
  res?: Response;

  // Additional context injected by the WebSocket server (e.g. graphql-ws)
  // Used to carry authenticated user data in subscription connections
  extra?: SubscriptionExtra;
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
     */
    CacheModule.registerAsync({
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
    }),

    // Initializes GraphQL globally
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [AuthModule],
      inject: [JwtService],
      useFactory: (jwtService: JwtService): ApolloDriverConfig => ({
        autoSchemaFile: join(process.cwd(), "src/schema.gql"),
        plugins: [createQueryComplexityPlugin(process.env)],

        subscriptions: {
          "graphql-ws": {
            // Give clients more time to send connection_init before server closes socket
            connectionInitWaitTimeout: 60_000,

            // Send websocket ping frames periodically to keep idle connections alive
            // @ts-expect-error keepAlive is supported by graphql-ws runtime options
            keepAlive: 20_000,

            onConnect: async (context) => {
              console.log("WS connectionParams:", context.connectionParams);

              const extra = context.extra as SubscriptionExtra;

              const auth =
                context.connectionParams?.authorization ??
                context.connectionParams?.Authorization;

              if (!auth) {
                throw new Error(
                  "Missing authorization in websocket connection params",
                );
              }

              if (typeof auth !== "string" || !auth.startsWith("Bearer ")) {
                throw new Error(
                  "Authorization must be in format: Bearer <token>",
                );
              }

              const token = auth.slice(7);

              try {
                const payload = await jwtService.verifyAsync<{
                  sub: number;
                }>(token);

                extra.user = {
                  id: payload.sub,
                };

                console.log("WS authenticated user:", extra.user);
              } catch {
                throw new Error("Invalid or expired websocket token");
              }
            },
          },
        },

        formatError: (error: GraphQLFormattedError) => ({
          message: error.message,
        }),

        context: ({
          req,
          res,
          extra,
        }: {
          req?: Request;
          res?: Response;
          extra?: SubscriptionExtra;
        }): GqlContext => ({
          req,
          res,
          extra,
        }),

        debug: false,
      }),
    }),

    // Registers the rate limiter globally
    ThrottlerModule.forRoot([
      {
        // 60 seconds
        ttl: 60,

        // 120 requests per ttl per client
        limit: 120,
      },
    ]),

    // Application Modules
    UsersModule,
    PostsModule,
    LikesModule,
    FollowsModule,
    AuthModule,
    NotificationsModule,
    CommentsModule,
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
export class AppModule {}

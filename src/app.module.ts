import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { ThrottlerModule } from "@nestjs/throttler";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver } from "@nestjs/apollo";
import { APP_GUARD } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Module } from "@nestjs/common";

import { NotificationsModule } from "@/notifications/notifications.module";
import { CommentsModule } from "@/comments/comments.module";
import { FollowsModule } from "@/follows/follows.module";
import { LikesModule } from "@/likes/likes.module";
import { PostsModule } from "@/posts/posts.module";
import { UsersModule } from "@/users/users.module";
import { AuthModule } from "@/auth/auth.module";

import { createGraphqlConfig } from "@/graphql/config/graphql.config";

import { cacheModuleConfig } from "@/cache/config/cache.config";

import { GqlThrottlerGuard } from "@/common/guards/qgl-throttler.guard";
import { GqlJwtGuard } from "@/common/guards/qgl-jwt.guard";

import { validateEnv } from "@/config/env/env.schema";

/**
 * Root NestJS application module
 *
 * Wires together global infrastructure and feature modules
 */

@Module({
  imports: [
    // Loads and exposes environment variables globally
    ConfigModule.forRoot({
      isGlobal: true,

      // Fail fast at startup if required environment variables are missing or invalid
      validate: validateEnv,
    }),

    // Registers the global Redis-backed cache with the shared async config
    CacheModule.registerAsync(cacheModuleConfig),

    // Initializes GraphQL globally
    GraphQLModule.forRootAsync({
      driver: ApolloDriver,
      imports: [AuthModule],
      inject: [JwtService, ConfigService],
      useFactory: createGraphqlConfig,
    }),

    // Registers the rate limiter globally
    ThrottlerModule.forRoot([
      {
        // 60 seconds in milliseconds
        ttl: 60_000,

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

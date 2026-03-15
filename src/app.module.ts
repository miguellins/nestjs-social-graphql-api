import { ConfigModule, ConfigService } from "@nestjs/config";
import { CacheModule } from "@nestjs/cache-manager";
import { ThrottlerModule } from "@nestjs/throttler";
import { GraphQLModule } from "@nestjs/graphql";
import { ApolloDriver } from "@nestjs/apollo";
import { JwtService } from "@nestjs/jwt";
import { APP_GUARD } from "@nestjs/core";
import { Module } from "@nestjs/common";

import { GqlThrottlerGuard } from "@/common/guards/qgl-throttler.guard";
import { GqlJwtGuard } from "@/common/guards/qgl-jwt.guard";

import { createGraphqlConfig } from "@/graphql/config/graphql.config";
import { cacheModuleConfig } from "@/cache/config/cache.config";

import { NotificationsModule } from "@/notifications/notifications.module";
import { CommentsModule } from "@/comments/comments.module";
import { FollowsModule } from "@/follows/follows.module";
import { UsersModule } from "@/users/users.module";
import { PostsModule } from "@/posts/posts.module";
import { LikesModule } from "@/likes/likes.module";
import { AuthModule } from "@/auth/auth.module";

import { validateEnv } from "@/config/env/env.schema";

/**
 * Composes the root application module and global infrastructure setup
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

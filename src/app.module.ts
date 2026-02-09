import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ThrottlerModule } from "@nestjs/throttler";
import { GraphQLModule } from "@nestjs/graphql";
import { APP_GUARD } from "@nestjs/core";
import { Module } from "@nestjs/common";

import { GqlThrottlerGuard } from "./common/guards/qgl-throttler.guard";
import { GqlJwtGuard } from "./common/guards/qgl-jwt.guard";

import { FollowsModule } from "./follows/follows.module";
import { UsersModule } from "./users/users.module";
import { PostsModule } from "./posts/posts.module";
import { LikesModule } from "./likes/likes.module";
import { AuthModule } from "./auth/auth.module";

import { join } from "path";

@Module({
  imports: [
    // Initializes GraphQL globally
    GraphQLModule.forRoot<ApolloDriverConfig>({
      // Uses ApolloDriverConfig for type safety
      driver: ApolloDriver,

      // Set code-first approach
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),

      // Customizes how errors are presented to the GraphQL client
      formatError: (error) => ({
        message: error.message,
      }),

      // Injects the HTTP request and response into the GraphQL context
      context: ({ req, res }) => ({ req, res }),

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

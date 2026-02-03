import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ThrottlerModule } from "@nestjs/throttler";
import { GraphQLModule } from "@nestjs/graphql";
import { APP_GUARD } from "@nestjs/core";
import { Module } from "@nestjs/common";

import { GqlThrottlerGuard } from "./guards/qgl-throttler.guard";

import { UsersModule } from "./users/users.module";

import { PostsModule } from "./posts/posts.module";

import { FollowsModule } from "./follows/follows.module";

import { LikesModule } from "./likes/likes.module";

import { join } from "path";

@Module({
  imports: [
    // Initializes GraphQL globally
    GraphQLModule.forRoot<ApolloDriverConfig>({
      // Uses ApolloDriverConfig for type safety
      driver: ApolloDriver,

      // Set code-first approach
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),

      // Injects the HTTP request and response into the GraphQL context
      context: ({ req, res }) => ({ req, res }),

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
    FollowsModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule { }

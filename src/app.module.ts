import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { ThrottlerModule } from "@nestjs/throttler";
import { GraphQLModule } from "@nestjs/graphql";
import { APP_GUARD } from "@nestjs/core";
import { Module } from "@nestjs/common";

import { GqlThrottlerGuard } from "./guards/qgl-throttler.guard";

import { UsersModule } from "./users/users.module";

import { PostsModule } from "./posts/posts.module";

import { join } from "path";
import { LikesModule } from './likes/likes.module';

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
        ttl: 60000,

        // 100 requests per ttl per client
        limit: 100,
      },
    ]),

    // Application Modules
    UsersModule,
    PostsModule,
    LikesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: GqlThrottlerGuard,
    },
  ],
})
export class AppModule {}

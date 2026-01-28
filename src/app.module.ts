import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { GraphQLModule } from "@nestjs/graphql";
import { Module } from "@nestjs/common";

import { UsersModule } from "./users/users.module";

import { join } from "path";
import { PostsModule } from "./posts/posts.module";

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,

      // Set code-first approach
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),
      playground: true,
    }),

    // Application Modules
    UsersModule,
    PostsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

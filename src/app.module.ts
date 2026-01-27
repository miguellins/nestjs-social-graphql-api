import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { Module } from '@nestjs/common';

import { UsersModule } from './users/users.module';

import { join } from 'path';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,

      // Code-first schema output
      autoSchemaFile: join(process.cwd(), "src/schema.gql"),
      playground: true,
    }),

    // Application Modules
    UsersModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule { }

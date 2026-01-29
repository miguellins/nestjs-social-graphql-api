Option 1: Custom Exception Filter (Recommended)

Create a custom exception filter to catch and format validation errors:
typescript// filters/graphql-exception.filter.ts

import { Catch, ArgumentsHost, BadRequestException } from '@nestjs/common';
import { GqlArgumentsHost, GqlExceptionFilter } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

@Catch(BadRequestException)
export class GraphQLValidationExceptionFilter implements GqlExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const gqlHost = GqlArgumentsHost.create(host);
    const response = exception.getResponse() as any;
    
    // Extract validation messages
    const messages = response.message || [];
    
    return new GraphQLError(
      Array.isArray(messages) ? messages.join(', ') : messages,
      {
        extensions: {
          code: 'BAD_REQUEST',
        },
      }
    );
  }
}

## Apply it to your resolver:

typescript// user.resolver.ts
import { UseFilters } from '@nestjs/common';
import { GraphQLValidationExceptionFilter } from './filters/graphql-exception.filter';

@Resolver()
export class UserResolver {
  @Mutation(() => User)
  @UseFilters(GraphQLValidationExceptionFilter)
  async createUser(@Args('input') input: CreateUserInput) {
    // your logic
  }
}
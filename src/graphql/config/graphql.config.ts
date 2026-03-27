import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import type {
  GqlContext,
  SubscriptionExtra,
} from "@/graphql/config/graphql-context.types";
import { createGraphqlSubscriptionsConfig } from "@/graphql/subscriptions/subscriptions.config";
import { createQueryComplexityPlugin } from "@/graphql/plugins/query-complexity.plugin";

import type { GraphQLFormattedError } from "graphql";

import type { Request, Response } from "express";

import { join } from "path";

/**
 * GraphQL module configuration factory
 *
 * Builds the Apollo GraphQL settings for the app
 */

// Creates the GraphQL module options from shared services and config
export function createGraphqlConfig(
  jwtService: JwtService,
  configService: ConfigService,
): ApolloDriverConfig {
  const queryComplexityEnv = {
    GRAPHQL_COMPLEXITY_ENFORCE:
      configService.get<boolean>("GRAPHQL_COMPLEXITY_ENFORCE") ?? false,
    GRAPHQL_COMPLEXITY_LOG:
      configService.get<boolean>("GRAPHQL_COMPLEXITY_LOG") ?? true,
    GRAPHQL_COMPLEXITY_WARN_AT:
      configService.get<number>("GRAPHQL_COMPLEXITY_WARN_AT") ?? 100,
    GRAPHQL_COMPLEXITY_MAX:
      configService.get<number>("GRAPHQL_COMPLEXITY_MAX") ?? 500,
    GRAPHQL_COMPLEXITY_MAX_QUERY_NODES:
      configService.get<number>("GRAPHQL_COMPLEXITY_MAX_QUERY_NODES") ?? 2000,
  };

  return {
    driver: ApolloDriver,
    autoSchemaFile: join(process.cwd(), "src/schema.gql"),

    // Limits query complexity to prevent expensive or abusive GraphQL queries
    plugins: [createQueryComplexityPlugin(queryComplexityEnv)],

    // Configures WebSocket subscriptions for GraphQL with authentication, using the JWT service
    subscriptions: createGraphqlSubscriptionsConfig(jwtService),

    // Strips internal error details from GraphQL responses sent to clients
    formatError: (error: GraphQLFormattedError) => ({
      message: error.message,
    }),

    // Builds the unified context object available to all resolvers
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
  };
}

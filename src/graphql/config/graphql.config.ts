import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { JwtService } from "@nestjs/jwt";

import { createQueryComplexityPlugin } from "@/graphql/plugins/query-complexity.plugin";
import type {
  GqlContext,
  SubscriptionExtra,
} from "@/graphql/config/graphql-context.types";
import { createGraphqlSubscriptionsConfig } from "@/graphql/subscriptions/subscriptions.config";

import type { GraphQLFormattedError } from "graphql";
import type { Request, Response } from "express";

import { join } from "path";

/**
 * Creates the root GraphQL module configuration for the application
 *
 * This centralizes schema generation, query-complexity protection,
 * subscription transport setup, error shaping, and resolver context creation.
 */

export function createGraphqlConfig(
  jwtService: JwtService,
): ApolloDriverConfig {
  return {
    driver: ApolloDriver,
    autoSchemaFile: join(process.cwd(), "src/schema.gql"),

    // Limits query complexity to prevent expensive or abusive GraphQL queries
    plugins: [createQueryComplexityPlugin(process.env)],

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

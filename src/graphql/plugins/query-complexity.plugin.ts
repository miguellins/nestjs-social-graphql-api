import { Logger } from "@nestjs/common";

import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from "graphql-query-complexity";
import { GraphQLError, type GraphQLSchema } from "graphql";

import type {
  ApolloServerPlugin,
  GraphQLRequestContextDidResolveOperation,
} from "@apollo/server";

type QueryComplexityPluginOptions = {
  enforce: boolean;
  log: boolean;
  maxComplexity: number;
  warnAt: number;
  maxQueryNodes: number;
};

const SUBSCRIPTION_OPERATION = "subscription";

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;

  return value.toLowerCase() === "true";
}

function readPositiveInt(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (value === undefined) return fallback;

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

export function getQueryComplexityPluginOptions(
  env: NodeJS.ProcessEnv,
): QueryComplexityPluginOptions {
  const warnAt = readPositiveInt(
    env.GRAPHQL_COMPLEXITY_WARN_AT,
    100,
    "GRAPHQL_COMPLEXITY_WARN_AT",
  );

  const maxComplexity = readPositiveInt(
    env.GRAPHQL_COMPLEXITY_MAX,
    500,
    "GRAPHQL_COMPLEXITY_MAX",
  );

  return {
    // Start rollout in log-only mode to avoid impacting existing clients.
    enforce: readBoolean(env.GRAPHQL_COMPLEXITY_ENFORCE, false),
    log: readBoolean(env.GRAPHQL_COMPLEXITY_LOG, true),
    warnAt,
    maxComplexity,
    maxQueryNodes: readPositiveInt(
      env.GRAPHQL_COMPLEXITY_MAX_QUERY_NODES,
      2_000,
      "GRAPHQL_COMPLEXITY_MAX_QUERY_NODES",
    ),
  };
}

function shouldSkipComplexityCheck(
  requestContext: GraphQLRequestContextDidResolveOperation<object>,
): boolean {
  const operationType = requestContext.operation?.operation;

  return (
    String(operationType) === SUBSCRIPTION_OPERATION ||
    requestContext.request.operationName === "IntrospectionQuery"
  );
}

function formatOperationName(
  requestContext: GraphQLRequestContextDidResolveOperation<object>,
): string {
  return (
    requestContext.request.operationName ??
    requestContext.operationName ??
    "anonymous"
  );
}

function calculateComplexity(
  schema: GraphQLSchema,
  requestContext: GraphQLRequestContextDidResolveOperation<object>,
  options: QueryComplexityPluginOptions,
): number {
  if (!requestContext.document) {
    throw new Error(
      "Cannot calculate query complexity without a parsed document",
    );
  }

  return getComplexity({
    schema,
    query: requestContext.document,
    variables: requestContext.request.variables ?? {},
    operationName:
      requestContext.request.operationName ??
      requestContext.operationName ??
      undefined,
    estimators: [
      fieldExtensionsEstimator(),
      simpleEstimator({ defaultComplexity: 1 }),
    ],
    maxQueryNodes: options.maxQueryNodes,
  });
}

export function createQueryComplexityPlugin(
  env: NodeJS.ProcessEnv,
): ApolloServerPlugin<object> {
  const options = getQueryComplexityPluginOptions(env);
  const logger = new Logger("GraphQLComplexity");

  return {
    requestDidStart() {
      return Promise.resolve({
        didResolveOperation(
          requestContext: GraphQLRequestContextDidResolveOperation<object>,
        ) {
          return Promise.resolve().then(() => {
            if (shouldSkipComplexityCheck(requestContext)) return;

            const complexity = calculateComplexity(
              requestContext.schema,
              requestContext,
              options,
            );

            const operationName = formatOperationName(requestContext);
            const message = `operation=${operationName} complexity=${complexity}`;

            if (options.log) {
              if (complexity >= options.warnAt) logger.warn(message);
              else logger.log(message);
            }

            if (options.enforce && complexity > options.maxComplexity) {
              throw new GraphQLError(
                `Query is too complex: ${complexity}. Maximum allowed complexity: ${options.maxComplexity}`,
              );
            }
          });
        },
      });
    },
  };
}

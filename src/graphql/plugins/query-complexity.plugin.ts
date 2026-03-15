import { Logger } from "@nestjs/common";
import type {
  ApolloServerPlugin,
  GraphQLRequestContextDidResolveOperation,
} from "@apollo/server";

import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from "graphql-query-complexity";
import {
  GraphQLError,
  Kind,
  type GraphQLSchema,
  type SelectionNode,
} from "graphql";

import { queryComplexityOptionsSchema } from "@/graphql/plugins/query-complexity-options.schema";

/**
 * Enforces and logs GraphQL query complexity using validated configuration
 */

type QueryComplexityPluginOptions = {
  enforce: boolean;
  log: boolean;
  maxComplexity: number;
  warnAt: number;
  maxQueryNodes: number;
};

const SUBSCRIPTION_OPERATION = "subscription";

// Reads complexity options from runtime configuration input
export function getQueryComplexityPluginOptions(
  env: Record<string, unknown>,
): QueryComplexityPluginOptions {
  const parsed = queryComplexityOptionsSchema.parse(env);

  return {
    // Start rollout in log-only mode to avoid impacting existing clients
    enforce: parsed.GRAPHQL_COMPLEXITY_ENFORCE,
    log: parsed.GRAPHQL_COMPLEXITY_LOG,
    warnAt: parsed.GRAPHQL_COMPLEXITY_WARN_AT,
    maxComplexity: parsed.GRAPHQL_COMPLEXITY_MAX,
    maxQueryNodes: parsed.GRAPHQL_COMPLEXITY_MAX_QUERY_NODES,
  };
}

// Skips complexity checks for subscriptions and introspection queries
function shouldSkipComplexityCheck(
  requestContext: GraphQLRequestContextDidResolveOperation<object>,
): boolean {
  const operationType = requestContext.operation?.operation;
  const operationName =
    requestContext.request.operationName ?? requestContext.operationName;

  return (
    String(operationType) === SUBSCRIPTION_OPERATION ||
    operationName === "IntrospectionQuery" ||
    containsIntrospectionSelection(
      requestContext.operation?.selectionSet?.selections,
    )
  );
}

// Detects introspection fields inside a selection set
function containsIntrospectionSelection(
  selections: readonly SelectionNode[] | undefined,
): boolean {
  if (!selections) return false;

  return selections.some((selection) => {
    if (selection.kind !== Kind.FIELD) return false;

    const field = selection;

    if (field.name.value.startsWith("__")) return true;

    return containsIntrospectionSelection(field.selectionSet?.selections);
  });
}

// Resolves the operation name used in logs and errors
function formatOperationName(
  requestContext: GraphQLRequestContextDidResolveOperation<object>,
): string {
  return (
    requestContext.request.operationName ??
    requestContext.operationName ??
    "anonymous"
  );
}

// Calculates GraphQL complexity for the current operation
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

// Creates the Apollo plugin that enforces query-complexity rules
export function createQueryComplexityPlugin(
  env: Record<string, unknown>,
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

            if (options.log && complexity >= options.warnAt) {
              logger.warn(message);
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

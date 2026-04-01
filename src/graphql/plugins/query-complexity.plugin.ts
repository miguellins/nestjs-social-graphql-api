import { Logger } from "@nestjs/common";

import {
  fieldExtensionsEstimator,
  getComplexity,
  simpleEstimator,
} from "graphql-query-complexity";

import { queryComplexityOptionsSchema } from "@/graphql/plugins/query-complexity-options.schema";

import type {
  ApolloServerPlugin,
  GraphQLRequestContextDidResolveOperation,
} from "@apollo/server";

import {
  GraphQLError,
  Kind,
  type GraphQLSchema,
  type SelectionNode,
} from "graphql";

/** Options for configuring the GraphQL query complexity plugin. */
type QueryComplexityPluginOptions = {
  enforce: boolean;
  log: boolean;
  maxComplexity: number;
  warnAt: number;
  maxQueryNodes: number;
};

/** Constant for subscription operation type. */
const SUBSCRIPTION_OPERATION = "subscription";

/** Returns query complexity plugin options parsed from the runtime environment. */
export function getQueryComplexityPluginOptions(
  env: Record<string, unknown>,
): QueryComplexityPluginOptions {
  const parsed = queryComplexityOptionsSchema.parse(env);

  return {
    enforce: parsed.GRAPHQL_COMPLEXITY_ENFORCE,
    log: parsed.GRAPHQL_COMPLEXITY_LOG,
    warnAt: parsed.GRAPHQL_COMPLEXITY_WARN_AT,
    maxComplexity: parsed.GRAPHQL_COMPLEXITY_MAX,
    maxQueryNodes: parsed.GRAPHQL_COMPLEXITY_MAX_QUERY_NODES,
  };
}

/** Returns true if this operation should skip complexity checking (subscriptions/introspection). */
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

/** Returns true if the selection set contains introspection fields. */
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

/** Returns a formatted GraphQL operation name for logging or error messages. */
function formatOperationName(
  requestContext: GraphQLRequestContextDidResolveOperation<object>,
): string {
  return (
    requestContext.request.operationName ??
    requestContext.operationName ??
    "anonymous"
  );
}

/** Calculates and returns the complexity for the current GraphQL operation. */
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

/** Creates and returns an Apollo plugin that enforces query complexity rules. */
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

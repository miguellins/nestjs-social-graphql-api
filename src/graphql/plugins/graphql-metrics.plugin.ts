import { performance } from "node:perf_hooks";

import type {
  ApolloServerPlugin,
  GraphQLRequestContextWillSendResponse,
  GraphQLRequestListener,
} from "@apollo/server";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import {
  MetricsRegistryService,
  type GraphqlOperationOutcome,
  type GraphqlOperationType,
} from "@/metrics/metrics-registry.service";

import type { GraphQLFormattedError } from "graphql/error/GraphQLError";
import { OperationTypeNode } from "graphql/language/ast";
import { Kind } from "graphql/language/kinds";

const PUBLIC_GRAPHQL_ERROR_CODES = new Set<string>(
  Object.values(GRAPHQL_ERROR_CODES),
);
const INTERNAL_GRAPHQL_ERROR_CODE = GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const ANONYMOUS_OPERATION_NAME = "anonymous";

/** Creates an Apollo plugin that records low-cardinality GraphQL Prometheus metrics. */
export function createGraphqlMetricsPlugin(
  metricsRegistry: MetricsRegistryService,
): ApolloServerPlugin<object> {
  return {
    requestDidStart(): Promise<GraphQLRequestListener<object>> {
      const startedAt = performance.now();

      return Promise.resolve({
        willSendResponse(
          requestContext: GraphQLRequestContextWillSendResponse<object>,
        ): Promise<void> {
          try {
            recordGraphqlMetrics(metricsRegistry, requestContext, startedAt);
          } catch {
            // Metrics must never affect GraphQL responses.
          }

          return Promise.resolve();
        },
      });
    },
  };
}

/** Records operation duration, outcome, and allowlisted error codes. */
function recordGraphqlMetrics(
  metricsRegistry: MetricsRegistryService,
  requestContext: GraphQLRequestContextWillSendResponse<object>,
  startedAt: number,
): void {
  const operationType = getOperationType(requestContext);
  if (!operationType) return;
  if (isIntrospectionOperation(requestContext)) return;

  const operationName = getOperationName(requestContext);
  const errors = getResponseErrors(requestContext);
  const outcome = getOperationOutcome(requestContext, errors);
  const durationSeconds = Math.max(0, performance.now() - startedAt) / 1_000;

  metricsRegistry.recordGraphqlOperation(
    operationName,
    operationType,
    outcome,
    durationSeconds,
  );

  for (const error of errors) {
    const code = getErrorCode(error);
    if (code && PUBLIC_GRAPHQL_ERROR_CODES.has(code)) {
      metricsRegistry.incrementGraphqlOperationError(operationName, code);
    }
  }
}

/** Resolves the operation name from trusted Apollo operation metadata. */
function getOperationName(
  requestContext: GraphQLRequestContextWillSendResponse<object>,
): string {
  const operationName = requestContext.operationName?.trim();
  return operationName && operationName.length > 0
    ? operationName
    : ANONYMOUS_OPERATION_NAME;
}

/** Resolves the operation type from the parsed GraphQL operation definition. */
function getOperationType(
  requestContext: GraphQLRequestContextWillSendResponse<object>,
): GraphqlOperationType | undefined {
  const operationType = requestContext.operation?.operation;

  if (operationType === OperationTypeNode.MUTATION) return "mutation";
  if (operationType === OperationTypeNode.QUERY) return "query";
  if (operationType === OperationTypeNode.SUBSCRIPTION) return "subscription";

  return undefined;
}

/** Returns formatted errors from single-result GraphQL responses. */
function getResponseErrors(
  requestContext: GraphQLRequestContextWillSendResponse<object>,
): readonly GraphQLFormattedError[] {
  const body = requestContext.response.body;
  if (body.kind !== "single") return [];

  return body.singleResult.errors ?? [];
}

/** Classifies the final GraphQL response into the v1 metrics outcome taxonomy. */
function getOperationOutcome(
  requestContext: GraphQLRequestContextWillSendResponse<object>,
  errors: readonly GraphQLFormattedError[],
): GraphqlOperationOutcome {
  if (errors.length === 0) return "success";

  const httpStatus = requestContext.response.http.status;
  if (
    typeof httpStatus === "number" &&
    httpStatus >= HTTP_INTERNAL_SERVER_ERROR
  ) {
    return "internal_error";
  }

  return errors.every(isClientVisibleGraphqlError)
    ? "graphql_error"
    : "internal_error";
}

/** Checks whether a formatted error maps to the public GraphQL error contract. */
function isClientVisibleGraphqlError(error: GraphQLFormattedError): boolean {
  const code = getErrorCode(error);

  return (
    typeof code === "string" &&
    code !== INTERNAL_GRAPHQL_ERROR_CODE &&
    PUBLIC_GRAPHQL_ERROR_CODES.has(code)
  );
}

/** Reads a string error code from formatted GraphQL extensions. */
function getErrorCode(error: GraphQLFormattedError): string | undefined {
  const code = error.extensions?.["code"];
  return typeof code === "string" ? code : undefined;
}

/** Detects schema introspection operations from the parsed operation AST. */
function isIntrospectionOperation(
  requestContext: GraphQLRequestContextWillSendResponse<object>,
): boolean {
  const operation = requestContext.operation;
  if (!operation || operation.operation !== OperationTypeNode.QUERY) {
    return false;
  }

  return operation.selectionSet.selections.some((selection) => {
    return (
      selection.kind === Kind.FIELD &&
      (selection.name.value === "__schema" || selection.name.value === "__type")
    );
  });
}

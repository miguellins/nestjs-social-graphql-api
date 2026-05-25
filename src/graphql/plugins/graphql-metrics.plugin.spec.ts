import { createGraphqlMetricsPlugin } from "@/graphql/plugins/graphql-metrics.plugin";
import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import { Kind, parse } from "graphql";

import type { GraphQLRequestContextWillSendResponse } from "@apollo/server";
import type { OperationDefinitionNode } from "graphql";

describe("createGraphqlMetricsPlugin", () => {
  const recordGraphqlOperationMock = jest.fn();
  const incrementGraphqlOperationErrorMock = jest.fn();
  const metricsRegistry = {
    recordGraphqlOperation: recordGraphqlOperationMock,
    incrementGraphqlOperationError: incrementGraphqlOperationErrorMock,
  } as unknown as MetricsRegistryService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("records successful named operations", async () => {
    await sendResponse(
      metricsRegistry,
      createContext({
        operationName: "ViewerQuery",
        operationSource: "query ViewerQuery { viewer { id } }",
      }),
    );

    expect(recordGraphqlOperationMock).toHaveBeenCalledWith(
      "ViewerQuery",
      "query",
      "success",
      expect.any(Number),
    );
    expect(incrementGraphqlOperationErrorMock).not.toHaveBeenCalled();
  });

  it("uses anonymous for unnamed operations", async () => {
    await sendResponse(
      metricsRegistry,
      createContext({
        operationName: undefined,
        operationSource: "mutation { logout(input: { allSessions: false }) }",
      }),
    );

    expect(recordGraphqlOperationMock).toHaveBeenCalledWith(
      "anonymous",
      "mutation",
      "success",
      expect.any(Number),
    );
  });

  it("records client-visible GraphQL errors and allowlisted codes", async () => {
    await sendResponse(
      metricsRegistry,
      createContext({
        errors: [
          {
            message: "Invalid input.",
            extensions: { code: GRAPHQL_ERROR_CODES.BAD_REQUEST },
          },
        ],
        httpStatus: 400,
        operationName: "UpdateProfile",
        operationSource:
          "mutation UpdateProfile { updateProfile(input: {}) { id } }",
      }),
    );

    expect(recordGraphqlOperationMock).toHaveBeenCalledWith(
      "UpdateProfile",
      "mutation",
      "graphql_error",
      expect.any(Number),
    );
    expect(incrementGraphqlOperationErrorMock).toHaveBeenCalledWith(
      "UpdateProfile",
      GRAPHQL_ERROR_CODES.BAD_REQUEST,
    );
  });

  it("classifies HTTP 500 and internal codes as internal errors", async () => {
    await sendResponse(
      metricsRegistry,
      createContext({
        errors: [
          {
            message: "Unexpected error.",
            extensions: { code: GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR },
          },
        ],
        httpStatus: 500,
        operationName: "FeedQuery",
        operationSource: "query FeedQuery { homeFeed { id } }",
      }),
    );

    expect(recordGraphqlOperationMock).toHaveBeenCalledWith(
      "FeedQuery",
      "query",
      "internal_error",
      expect.any(Number),
    );
    expect(incrementGraphqlOperationErrorMock).toHaveBeenCalledWith(
      "FeedQuery",
      GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR,
    );
  });

  it("skips introspection operations", async () => {
    await sendResponse(
      metricsRegistry,
      createContext({
        operationName: "IntrospectionQuery",
        operationSource:
          "query IntrospectionQuery { __schema { queryType { name } } }",
      }),
    );

    expect(recordGraphqlOperationMock).not.toHaveBeenCalled();
  });
});

async function sendResponse(
  metricsRegistry: MetricsRegistryService,
  context: GraphQLRequestContextWillSendResponse<object>,
): Promise<void> {
  const plugin = createGraphqlMetricsPlugin(metricsRegistry);
  const listener = await plugin.requestDidStart?.(
    context as Parameters<NonNullable<typeof plugin.requestDidStart>>[0],
  );

  await listener?.willSendResponse?.(context);
}

function createContext({
  errors,
  httpStatus = 200,
  operationName,
  operationSource,
}: {
  errors?: Array<{ extensions?: Record<string, unknown>; message: string }>;
  httpStatus?: number;
  operationName: string | undefined;
  operationSource: string;
}): GraphQLRequestContextWillSendResponse<object> {
  const document = parse(operationSource);
  const operation = document.definitions.find(
    (definition): definition is OperationDefinitionNode =>
      definition.kind === Kind.OPERATION_DEFINITION,
  );

  if (!operation) throw new Error("Missing operation definition");

  return {
    operation,
    operationName,
    response: {
      body: {
        kind: "single",
        singleResult: {
          ...(errors ? { errors } : {}),
        },
      },
      http: {
        status: httpStatus,
      },
    },
  } as unknown as GraphQLRequestContextWillSendResponse<object>;
}

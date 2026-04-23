import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { NotFoundException } from "@nestjs/common";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { RequestContextService } from "@/common/request-context/request-context.service";
import { createGraphqlConfig } from "@/graphql/config/graphql.config";
import { createBadRequestStatusPlugin } from "@/graphql/plugins/bad-request-status.plugin";
import { createQueryComplexityPlugin } from "@/graphql/plugins/query-complexity.plugin";
import { createGraphqlSubscriptionsConfig } from "@/graphql/subscriptions/subscriptions.config";
import type { GqlContext } from "@/graphql/config/graphql-context.types";

import type { GraphQLFormattedError } from "graphql";

type TestedFormatError = (
  error: GraphQLFormattedError,
  errorWithContext: unknown,
) => {
  message: string;
  extensions: {
    code: string;
    fields?: string[];
  };
};

type TestedContextFactory = (args: {
  req?: {
    headers: { authorization?: string };
    requestId?: string;
    body?: { operationName?: unknown };
  };
  res?: { locals: Record<string, unknown> };
  extra?: { user?: { id: number }; requestId?: string; operationName?: string };
}) => GqlContext;

type TestedGraphqlConfig = ApolloDriverConfig & {
  formatError: TestedFormatError;
  context: TestedContextFactory;
};

type TestedSubscriptionsConfig = {
  "graphql-ws": {
    onConnect: unknown;
  };
};

function callTestContext(
  value: unknown,
  args: Parameters<TestedContextFactory>[0],
): GqlContext {
  const context = value as TestedContextFactory;
  return context(args);
}

jest.mock("@/graphql/plugins/query-complexity.plugin", () => ({
  createQueryComplexityPlugin: jest.fn(() => "complexity-plugin"),
}));

jest.mock("@/graphql/plugins/bad-request-status.plugin", () => ({
  createBadRequestStatusPlugin: jest.fn(() => "bad-request-status-plugin"),
}));

jest.mock("@/graphql/subscriptions/subscriptions.config", () => ({
  createGraphqlSubscriptionsConfig: jest.fn(() => ({
    "graphql-ws": {
      onConnect: jest.fn(),
    },
  })),
}));

describe("createGraphqlConfig", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("builds the Apollo config with sanitized structured errors, context wiring, and shared plugins", () => {
    const jwtService = { signAsync: jest.fn() };
    const configService = {
      get: jest.fn((key: string) => {
        switch (key) {
          case "GRAPHQL_COMPLEXITY_ENFORCE":
            return true;
          case "GRAPHQL_COMPLEXITY_LOG":
            return false;
          case "GRAPHQL_COMPLEXITY_WARN_AT":
            return 25;
          case "GRAPHQL_COMPLEXITY_MAX":
            return 250;
          case "GRAPHQL_COMPLEXITY_MAX_QUERY_NODES":
            return 500;
          default:
            return undefined;
        }
      }),
    };
    const setRequestIdMock = jest.fn();
    const setOperationNameMock = jest.fn();
    const requestContextService = {
      setRequestId: setRequestIdMock,
      setOperationName: setOperationNameMock,
    } as unknown as RequestContextService;

    const rawConfig = createGraphqlConfig(
      jwtService as never,
      configService as never,
      requestContextService,
    );
    const config = rawConfig as unknown as TestedGraphqlConfig;
    const createQueryComplexityPluginMock = jest.mocked(
      createQueryComplexityPlugin,
    );
    const createBadRequestStatusPluginMock = jest.mocked(
      createBadRequestStatusPlugin,
    );
    const createGraphqlSubscriptionsConfigMock = jest.mocked(
      createGraphqlSubscriptionsConfig,
    );
    const formatError = rawConfig.formatError as TestedFormatError;
    const subscriptions =
      rawConfig.subscriptions as unknown as TestedSubscriptionsConfig;

    expect(createQueryComplexityPluginMock).toHaveBeenCalledWith({
      GRAPHQL_COMPLEXITY_ENFORCE: true,
      GRAPHQL_COMPLEXITY_LOG: false,
      GRAPHQL_COMPLEXITY_WARN_AT: 25,
      GRAPHQL_COMPLEXITY_MAX: 250,
      GRAPHQL_COMPLEXITY_MAX_QUERY_NODES: 500,
    });
    expect(createBadRequestStatusPluginMock).toHaveBeenCalled();
    expect(createGraphqlSubscriptionsConfigMock).toHaveBeenCalledWith(
      jwtService,
    );
    expect(config.driver).toBe(ApolloDriver);
    expect(config.autoSchemaFile).toMatch(/src\/schema\.gql$/);
    expect(config.plugins).toEqual([
      "complexity-plugin",
      "bad-request-status-plugin",
    ]);
    expect(typeof subscriptions["graphql-ws"].onConnect).toBe("function");
    expect(config.debug).toBe(false);
    expect(
      formatError(
        {
          message: "Post not found",
          locations: [],
          path: ["postById"],
          extensions: {
            code: "INTERNAL_SERVER_ERROR",
            originalError: {
              message: "Post not found",
              code: "NOT_FOUND",
            },
            exception: {
              stacktrace: ["secret"],
            },
          },
        } as never,
        {
          originalError: new NotFoundException({
            message: "Post not found",
            code: "NOT_FOUND",
          }),
        } as never,
      ),
    ).toEqual({
      message: "Post not found",
      extensions: {
        code: GRAPHQL_ERROR_CODES.NOT_FOUND,
      },
    });
    expect(
      formatError(
        {
          message: "Database error",
          locations: [],
          path: ["users"],
          extensions: {
            code: "DB_ERROR",
            exception: {
              stacktrace: ["secret"],
            },
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Database error",
      extensions: {
        code: GRAPHQL_ERROR_CODES.DB_ERROR,
      },
    });
    expect(
      formatError(
        {
          message: "Already exists: email",
          locations: [],
          path: ["createUser"],
          extensions: {
            code: "DUPLICATE",
            fields: ["email"],
            exception: {
              stacktrace: ["secret"],
            },
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Already exists: email",
      extensions: {
        code: GRAPHQL_ERROR_CODES.DUPLICATE,
        fields: ["email"],
      },
    });
    expect(
      formatError(
        {
          message: "Unhandled error",
          locations: [],
          path: ["users"],
          extensions: {
            exception: {
              stacktrace: ["secret"],
            },
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Unhandled error",
      extensions: {
        code: GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR,
      },
    });
    expect(
      formatError(
        {
          message: "Invalid input",
          locations: [],
          path: ["updateUser"],
          extensions: {
            code: "BAD_REQUEST",
            fields: ["email", 12, null],
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Invalid input",
      extensions: {
        code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
        fields: ["email"],
      },
    });
    expect(
      formatError(
        {
          message: "Other error",
          locations: [],
          path: ["users"],
          extensions: {
            code: "ARBITRARY_CODE",
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Other error",
      extensions: {
        code: GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR,
      },
    });
    expect(
      formatError(
        {
          message:
            'Variable "$input" got invalid value "" at "input.reason"; Value "" does not exist in "ReportReason" enum.',
          locations: [],
          path: ["reportPost"],
          extensions: {
            code: "GRAPHQL_VALIDATION_FAILED",
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Invalid value for input.reason.",
      extensions: {
        code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
      },
    });
    expect(
      formatError(
        {
          message:
            'Variable "$input" got invalid value "" at "input.reason"; Value "" does not exist in "ReportReason" enum.',
          locations: [],
          path: ["reportPost"],
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Invalid value for input.reason.",
      extensions: {
        code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
      },
    });
    expect(
      formatError(
        {
          message: "Invalid input",
          locations: [],
          path: ["updateUser"],
          extensions: {
            code: "BAD_REQUEST",
            fields: [12, null],
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Invalid input",
      extensions: {
        code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
      },
    });
    expect(
      formatError(
        {
          message: "Other error",
          locations: [],
          path: ["users"],
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Other error",
      extensions: {
        code: GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR,
      },
    });
    expect(
      callTestContext(
        rawConfig.context as unknown,
        {
          req: {
            headers: { authorization: "Bearer token" },
            requestId: "req-123",
            body: { operationName: "FeedQuery" },
          },
          res: { locals: {} },
          extra: { user: { id: 7 } },
        } as never,
      ),
    ).toEqual({
      req: {
        headers: { authorization: "Bearer token" },
        requestId: "req-123",
        body: { operationName: "FeedQuery" },
      },
      res: { locals: {} },
      extra: { user: { id: 7 } },
      requestId: "req-123",
      operationName: "FeedQuery",
    });
    expect(setRequestIdMock).toHaveBeenCalledWith("req-123");
    expect(setOperationNameMock).toHaveBeenCalledWith("FeedQuery");
  });

  it("uses websocket request context metadata when no HTTP request exists", () => {
    const setRequestIdMock = jest.fn();
    const setOperationNameMock = jest.fn();
    const requestContextService = {
      setRequestId: setRequestIdMock,
      setOperationName: setOperationNameMock,
    } as unknown as RequestContextService;

    const rawConfig = createGraphqlConfig(
      { signAsync: jest.fn() } as never,
      { get: jest.fn() } as never,
      requestContextService,
    );

    expect(
      callTestContext(
        rawConfig.context as unknown,
        {
          extra: {
            user: { id: 9 },
            requestId: "ws-req-1",
            operationName: "NotificationsSubscription",
          },
        } as never,
      ),
    ).toEqual({
      extra: {
        user: { id: 9 },
        requestId: "ws-req-1",
        operationName: "NotificationsSubscription",
      },
      requestId: "ws-req-1",
      operationName: "NotificationsSubscription",
    });
    expect(setRequestIdMock).toHaveBeenCalledWith("ws-req-1");
    expect(setOperationNameMock).toHaveBeenCalledWith(
      "NotificationsSubscription",
    );
  });

  it("prefers trimmed HTTP metadata over websocket metadata when both are present", () => {
    const setRequestIdMock = jest.fn();
    const setOperationNameMock = jest.fn();
    const requestContextService = {
      setRequestId: setRequestIdMock,
      setOperationName: setOperationNameMock,
    } as unknown as RequestContextService;

    const rawConfig = createGraphqlConfig(
      { signAsync: jest.fn() } as never,
      { get: jest.fn() } as never,
      requestContextService,
    );

    expect(
      callTestContext(
        rawConfig.context as unknown,
        {
          req: {
            headers: {},
            requestId: "http-req",
            body: { operationName: "  FeedQuery  " },
          },
          extra: {
            requestId: "ws-req",
            operationName: "IgnoredSubscription",
          },
        } as never,
      ),
    ).toEqual({
      req: {
        headers: {},
        requestId: "http-req",
        body: { operationName: "  FeedQuery  " },
      },
      extra: {
        requestId: "ws-req",
        operationName: "IgnoredSubscription",
      },
      requestId: "http-req",
      operationName: "FeedQuery",
    });
    expect(setRequestIdMock).toHaveBeenCalledWith("http-req");
    expect(setOperationNameMock).toHaveBeenCalledWith("FeedQuery");
  });

  it("falls back to websocket operation metadata when the HTTP operation name is blank", () => {
    const setRequestIdMock = jest.fn();
    const setOperationNameMock = jest.fn();
    const requestContextService = {
      setRequestId: setRequestIdMock,
      setOperationName: setOperationNameMock,
    } as unknown as RequestContextService;

    const rawConfig = createGraphqlConfig(
      { signAsync: jest.fn() } as never,
      { get: jest.fn() } as never,
      requestContextService,
    );

    expect(
      callTestContext(
        rawConfig.context as unknown,
        {
          req: {
            headers: {},
            body: { operationName: "   " },
          },
          extra: {
            requestId: "ws-req-2",
            operationName: "  NotificationsSubscription  ",
          },
        } as never,
      ),
    ).toEqual({
      req: {
        headers: {},
        body: { operationName: "   " },
      },
      extra: {
        requestId: "ws-req-2",
        operationName: "  NotificationsSubscription  ",
      },
      requestId: "ws-req-2",
      operationName: "NotificationsSubscription",
    });
    expect(setRequestIdMock).toHaveBeenCalledWith("ws-req-2");
    expect(setOperationNameMock).toHaveBeenCalledWith(
      "NotificationsSubscription",
    );
  });

  it("does not mutate request context storage when request metadata is absent", () => {
    const setRequestIdMock = jest.fn();
    const setOperationNameMock = jest.fn();
    const requestContextService = {
      setRequestId: setRequestIdMock,
      setOperationName: setOperationNameMock,
    } as unknown as RequestContextService;

    const rawConfig = createGraphqlConfig(
      { signAsync: jest.fn() } as never,
      { get: jest.fn() } as never,
      requestContextService,
    );

    expect(
      callTestContext(
        rawConfig.context as unknown,
        {
          req: {
            headers: {},
            body: {},
          },
        } as never,
      ),
    ).toEqual({
      req: {
        headers: {},
        body: {},
      },
      requestId: undefined,
      operationName: undefined,
    });
    expect(setRequestIdMock).not.toHaveBeenCalled();
    expect(setOperationNameMock).not.toHaveBeenCalled();
  });

  it("sanitizes missing GraphQL variable errors to the public bad-request contract", () => {
    const rawConfig = createGraphqlConfig(
      { signAsync: jest.fn() } as never,
      { get: jest.fn() } as never,
      {
        setRequestId: jest.fn(),
        setOperationName: jest.fn(),
      } as unknown as RequestContextService,
    );
    const formatError = rawConfig.formatError as TestedFormatError;

    expect(
      formatError(
        {
          message:
            'Variable "$input" of required type "CreateUserInput!" was not provided.',
          locations: [],
          path: ["createUser"],
          extensions: {
            code: "BAD_USER_INPUT",
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Required input value was not provided.",
      extensions: {
        code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
      },
    });

    expect(
      formatError(
        {
          message:
            'Variable "$input" got invalid value { username: "miguelilins" }; Field "password" of required type "String!" was not provided.',
          locations: [],
          path: ["login"],
          extensions: {
            code: "BAD_USER_INPUT",
          },
        } as never,
        {} as never,
      ),
    ).toEqual({
      message: "Required input value was not provided.",
      extensions: {
        code: GRAPHQL_ERROR_CODES.BAD_REQUEST,
      },
    });
  });
});

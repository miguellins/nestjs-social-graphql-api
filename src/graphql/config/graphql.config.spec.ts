import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { NotFoundException } from "@nestjs/common";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { createGraphqlConfig } from "@/graphql/config/graphql.config";
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
  req?: { headers: { authorization: string } };
  res?: { locals: Record<string, unknown> };
  extra?: { user: { id: number } };
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

    const rawConfig = createGraphqlConfig(
      jwtService as never,
      configService as never,
    );
    const config = rawConfig as unknown as TestedGraphqlConfig;
    const createQueryComplexityPluginMock = jest.mocked(
      createQueryComplexityPlugin,
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
    expect(createGraphqlSubscriptionsConfigMock).toHaveBeenCalledWith(
      jwtService,
    );
    expect(config.driver).toBe(ApolloDriver);
    expect(config.autoSchemaFile).toMatch(/src\/schema\.gql$/);
    expect(config.plugins).toEqual(["complexity-plugin"]);
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
          req: { headers: { authorization: "Bearer token" } },
          res: { locals: {} },
          extra: { user: { id: 7 } },
        } as never,
      ),
    ).toEqual({
      req: { headers: { authorization: "Bearer token" } },
      res: { locals: {} },
      extra: { user: { id: 7 } },
    });
  });
});

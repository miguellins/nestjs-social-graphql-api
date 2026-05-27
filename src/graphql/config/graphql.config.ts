import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { createGraphqlSubscriptionsConfig } from "@/graphql/subscriptions/subscriptions.config";
import { createBadRequestStatusPlugin } from "@/graphql/plugins/bad-request-status.plugin";
import { createQueryComplexityPlugin } from "@/graphql/plugins/query-complexity.plugin";
import { createGraphqlMetricsPlugin } from "@/graphql/plugins/graphql-metrics.plugin";
import type {
  GqlContext,
  RequestWithContext,
  SubscriptionExtra,
} from "@/graphql/config/graphql-context.types";

import { RequestContextService } from "@/common/request-context/request-context.service";
import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import type { GraphQLError, GraphQLFormattedError } from "graphql";

import type { Response } from "express";

import { existsSync } from "fs";
import { join } from "path";

type PublicGraphqlErrorExtensions = {
  code: string;
  fields?: string[];
};

const PUBLIC_GRAPHQL_ERROR_CODES = new Set<string>(
  Object.values(GRAPHQL_ERROR_CODES),
);

const GRAPHQL_BAD_REQUEST_CODES = new Set([
  "BAD_USER_INPUT",
  "GRAPHQL_VALIDATION_FAILED",
]);

/** Narrows unknown values to plain object records. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Checks whether a raw GraphQL error code is part of the public API contract. */
function isPublicGraphqlErrorCode(code: unknown): code is string {
  return typeof code === "string" && PUBLIC_GRAPHQL_ERROR_CODES.has(code);
}

/** Detects GraphQL request/input validation failures that happen before resolver execution. */
function isGraphqlBadRequestMessage(message: string): boolean {
  return (
    message.startsWith('Variable "$') ||
    message.includes("got invalid value") ||
    message.includes("was not provided") ||
    message.includes("Expected type") ||
    message.includes("Cannot query field") ||
    message.includes("Unknown argument") ||
    message.includes("Unknown type")
  );
}

/** Rewrites verbose GraphQL variable validation messages into shorter field-specific input errors. */
function toPublicGraphqlErrorMessage(message: string): string {
  const invalidValueMatch =
    /^Variable "\$[^"]+" got invalid value .* at "([^"]+)";/.exec(message);
  if (invalidValueMatch) {
    return `Invalid value for ${invalidValueMatch[1]}.`;
  }

  const missingValueMatch =
    /^Variable "\$[^"]+" of required type .* was not provided\./.exec(
      message,
    ) ??
    /^Variable "\$[^"]+" got invalid value .*; Field "[^"]+" of required type .* was not provided\./.exec(
      message,
    );
  if (missingValueMatch) {
    return "Required input value was not provided.";
  }

  return message;
}

/** Maps GraphQL runtime validation/input errors to the public bad-request contract. */
function toPublicGraphqlErrorCode(code: unknown, message: string): string {
  if (typeof code === "string" && GRAPHQL_BAD_REQUEST_CODES.has(code)) {
    return GRAPHQL_ERROR_CODES.BAD_REQUEST;
  }

  if (isGraphqlBadRequestMessage(message)) {
    return GRAPHQL_ERROR_CODES.BAD_REQUEST;
  }

  if (isPublicGraphqlErrorCode(code)) {
    return code;
  }

  return GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR;
}

/** Extracts the sanitized original error payload from the underlying GraphQL runtime error when available. */
function getOriginalErrorExtensions(
  error: unknown,
): Record<string, unknown> | undefined {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    return isObject(response) ? response : undefined;
  }

  if (!isObject(error)) return undefined;

  if (typeof error["code"] === "string" || Array.isArray(error["fields"])) {
    return error;
  }

  const response = error["response"];
  if (isObject(response)) return response;

  const originalError = error["originalError"];
  if (isObject(originalError) || originalError instanceof HttpException) {
    return getOriginalErrorExtensions(originalError);
  }

  const extensions = error["extensions"];
  if (isObject(extensions)) {
    const nestedOriginalError = extensions["originalError"];
    if (
      isObject(nestedOriginalError) ||
      nestedOriginalError instanceof HttpException
    ) {
      return getOriginalErrorExtensions(nestedOriginalError);
    }
  }

  return undefined;
}

/** Maps a GraphQL formatted error to safe public error extensions for clients. */
function toPublicGraphqlErrorExtensions(
  error: GraphQLFormattedError,
  originalError: GraphQLError | undefined,
): PublicGraphqlErrorExtensions {
  const originalErrorExtensions = getOriginalErrorExtensions(originalError);
  const rawCode =
    originalErrorExtensions?.["code"] ?? error.extensions?.["code"];
  const rawFields =
    originalErrorExtensions?.["fields"] ?? error.extensions?.["fields"];
  const fields = Array.isArray(rawFields)
    ? rawFields.filter((field): field is string => typeof field === "string")
    : undefined;

  return {
    code: toPublicGraphqlErrorCode(rawCode, error.message),
    ...(fields && fields.length > 0 ? { fields } : {}),
  };
}

/** Creates Apollo GraphQL server config with query complexity limits, subscriptions, error formatting, and context setup. */
export function createGraphqlConfig(
  jwtService: JwtService,
  configService: ConfigService,
  requestContextService: RequestContextService,
  metricsRegistry: MetricsRegistryService,
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

  const schemaFilePath = join(process.cwd(), "src/schema.gql");
  const shouldWriteSchemaFile = existsSync(join(process.cwd(), "src"));

  return {
    driver: ApolloDriver,
    autoSchemaFile: shouldWriteSchemaFile ? schemaFilePath : true,

    // Limits query complexity to prevent expensive or abusive GraphQL queries
    plugins: [
      createQueryComplexityPlugin(queryComplexityEnv),
      createBadRequestStatusPlugin(),
      createGraphqlMetricsPlugin(metricsRegistry),
    ],

    // Configures WebSocket subscriptions for GraphQL with authentication, using the JWT service
    subscriptions: createGraphqlSubscriptionsConfig(jwtService),

    // Strips internal error details from GraphQL responses sent to clients
    formatError: (
      error: GraphQLFormattedError,
      originalError: GraphQLError,
    ) => ({
      message: toPublicGraphqlErrorMessage(error.message),
      extensions: toPublicGraphqlErrorExtensions(error, originalError),
    }),

    // Builds the unified context object available to all resolvers
    context: ({
      req,
      res,
      extra,
    }: {
      req?: RequestWithContext;
      res?: Response;
      extra?: SubscriptionExtra;
    }): GqlContext => {
      const requestId = req?.requestId ?? extra?.requestId;
      const operationName = getOperationName(req, extra);

      if (requestId) {
        requestContextService.setRequestId(requestId);
      }

      if (operationName) {
        requestContextService.setOperationName(operationName);
      }

      return {
        req,
        res,
        extra,
        requestId,
        operationName,
      };
    },

    debug: false,
  };
}

/** Resolves the GraphQL operation name from HTTP or websocket transport metadata. */
function getOperationName(
  req?: RequestWithContext,
  extra?: SubscriptionExtra,
): string | undefined {
  const reqOperationName = getRequestOperationName(req);

  if (typeof reqOperationName === "string" && reqOperationName.trim().length) {
    return reqOperationName.trim();
  }

  if (
    typeof extra?.operationName === "string" &&
    extra.operationName.trim().length
  ) {
    return extra.operationName.trim();
  }

  return undefined;
}

/** Safely reads the raw operation name field from the incoming HTTP request body. */
function getRequestOperationName(req?: RequestWithContext): unknown {
  const body: unknown = req?.body;

  if (!hasOperationName(body)) {
    return undefined;
  }

  return body.operationName;
}

/** Narrows unknown request bodies to objects that expose an operationName field. */
function hasOperationName(
  value: unknown,
): value is { operationName?: unknown } {
  return (
    typeof value === "object" && value !== null && "operationName" in value
  );
}

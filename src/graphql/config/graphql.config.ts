import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";

import { createGraphqlSubscriptionsConfig } from "@/graphql/subscriptions/subscriptions.config";
import { createQueryComplexityPlugin } from "@/graphql/plugins/query-complexity.plugin";
import type {
  GqlContext,
  SubscriptionExtra,
} from "@/graphql/config/graphql-context.types";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";

import type { GraphQLError, GraphQLFormattedError } from "graphql";

import type { Request, Response } from "express";

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
    formatError: (
      error: GraphQLFormattedError,
      originalError: GraphQLError,
    ) => ({
      message: error.message,
      extensions: toPublicGraphqlErrorExtensions(error, originalError),
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

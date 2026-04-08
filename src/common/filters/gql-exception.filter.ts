import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { GqlArgumentsHost, GqlExceptionFilter } from "@nestjs/graphql";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";

import { Prisma } from "@prisma/client";

/** Represents the normalized GraphQL-safe error payload shape. */
type GqlErrorResponseShape = {
  message?: string | string[];
  code?: string;
  fields?: string[];
};

/** Narrows unknown values to plain object records. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Safely normalizes `HttpException.getResponse()` into the shared error shape. */
function normalizeHttpExceptionResponse(res: unknown): GqlErrorResponseShape {
  if (typeof res === "string") return { message: res };

  if (!isObject(res)) return {};

  const message = res["message"];
  const code = res["code"];
  const fields = res["fields"];

  return {
    message:
      typeof message === "string" || Array.isArray(message)
        ? message
        : undefined,
    code: typeof code === "string" ? code : undefined,
    fields: Array.isArray(fields)
      ? fields.filter((f) => typeof f === "string")
      : undefined,
  };
}

/**
 * Global GraphQL exception filter
 *
 * Normalizes Prisma and Nest exceptions into a consistent
 * client-facing error shape for GraphQL responses
 */
@Catch()
export class GlobalGqlExceptionFilter implements GqlExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    /** Ensures the GraphQL host context is initialized for this exception path. */
    GqlArgumentsHost.create(host);

    /** Maps known Prisma request errors to sanitized GraphQL-safe HTTP exceptions. */
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        const fields = (exception.meta?.target as string[] | undefined) ?? [];
        return new HttpException(
          {
            message: `Already exists: ${fields.join(", ") || "unique field"}`,
            code: GRAPHQL_ERROR_CODES.DUPLICATE,
            fields,
          },
          HttpStatus.CONFLICT,
        );
      }

      if (exception.code === "P2003") {
        return new HttpException(
          {
            message: "Invalid reference",
            code: GRAPHQL_ERROR_CODES.FOREIGN_KEY,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (exception.code === "P2025") {
        return new HttpException(
          { message: "Not found", code: GRAPHQL_ERROR_CODES.NOT_FOUND },
          HttpStatus.NOT_FOUND,
        );
      }

      return new HttpException(
        { message: "Database error", code: GRAPHQL_ERROR_CODES.DB_ERROR },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      const normalized = normalizeHttpExceptionResponse(
        exception.getResponse(),
      );

      const message =
        typeof normalized.message === "string"
          ? normalized.message
          : Array.isArray(normalized.message)
            ? normalized.message[0]
            : "Request error";

      const code =
        normalized.code ??
        (status === 400
          ? GRAPHQL_ERROR_CODES.BAD_REQUEST
          : status === 409
            ? GRAPHQL_ERROR_CODES.DUPLICATE
          : status === 401
            ? GRAPHQL_ERROR_CODES.UNAUTHENTICATED
            : status === 403
              ? GRAPHQL_ERROR_CODES.FORBIDDEN
              : status === 404
                ? GRAPHQL_ERROR_CODES.NOT_FOUND
                : status >= 500
                  ? GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR
                  : GRAPHQL_ERROR_CODES.ERROR);

      const fields = normalized.fields;

      return new HttpException({ message, code, fields }, status);
    }

    return new HttpException(
      {
        message: "Internal server error",
        code: GRAPHQL_ERROR_CODES.INTERNAL_SERVER_ERROR,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { GqlArgumentsHost, GqlExceptionFilter } from "@nestjs/graphql";

import { Prisma } from "@prisma/client";

/**
 * This file centralizes GraphQL error normalization for the application
 *
 * It maps known Prisma and Nest exceptions into predictable HttpException
 * responses so GraphQL clients receive a consistent error payload
 */

type GqlErrorResponseShape = {
  message?: string | string[];
  code?: string;
  fields?: string[];
};

// Type guard to avoid 'as any'
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Narrow HttpException.getResponse() safely
function normalizeHttpExceptionResponse(res: unknown): GqlErrorResponseShape {
  if (typeof res === "string") return { message: res };

  if (!isObject(res)) return {};

  const message = res["message"];
  const code = res["code"];
  const fields = res["fields"];

  return {
    // Strong narrowing instead of any
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
    // ensures GraphQL context is correctly extracted (not required, but standard)
    GqlArgumentsHost.create(host);

    // Prisma known errors
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002") {
        const fields = (exception.meta?.target as string[] | undefined) ?? [];
        return new HttpException(
          {
            message: `Already exists: ${fields.join(", ") || "unique field"}`,
            code: "DUPLICATE",
            fields,
          },
          HttpStatus.CONFLICT,
        );
      }

      if (exception.code === "P2003") {
        // foreign key fails (like authorId invalid)
        return new HttpException(
          { message: "Invalid reference", code: "FOREIGN_KEY" },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (exception.code === "P2025") {
        return new HttpException(
          { message: "Not found", code: "NOT_FOUND" },
          HttpStatus.NOT_FOUND,
        );
      }

      return new HttpException(
        { message: "Database error", code: "DB_ERROR" },
        HttpStatus.BAD_REQUEST,
      );
    }

    // Normal Nest HTTP exceptions (BadRequest, Forbidden, NotFound, etc)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();

      // Remove `as any` and safely normalize the response
      const normalized = normalizeHttpExceptionResponse(
        exception.getResponse(),
      );

      // Message extraction now type-safe
      const message =
        typeof normalized.message === "string"
          ? normalized.message
          : Array.isArray(normalized.message)
            ? normalized.message[0]
            : "Request error";

      // Code selection uses typed normalized.code
      const code =
        normalized.code ??
        (status === 400
          ? "BAD_REQUEST"
          : status === 401
            ? "UNAUTHENTICATED"
            : status === 403
              ? "FORBIDDEN"
              : status === 404
                ? "NOT_FOUND"
                : "ERROR");

      // Fields are already validated as string[]
      const fields = normalized.fields;

      return new HttpException({ message, code, fields }, status);
    }

    // Unknown errors
    return new HttpException(
      { message: "Internal server error", code: "INTERNAL_SERVER_ERROR" },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

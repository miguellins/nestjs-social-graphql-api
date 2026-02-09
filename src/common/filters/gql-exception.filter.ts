import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { GqlArgumentsHost, GqlExceptionFilter } from "@nestjs/graphql";

import { Prisma } from "@prisma/client";

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
      const res = exception.getResponse() as any;

      // allow custom objects to pass through
      const message =
        typeof res === "string"
          ? res
          : Array.isArray(res?.message)
            ? res.message[0]
            : res?.message || "Request error";

      const code =
        typeof res === "object" && res?.code
          ? res.code
          : status === 400
            ? "BAD_REQUEST"
            : status === 401
              ? "UNAUTHENTICATED"
              : status === 403
                ? "FORBIDDEN"
                : status === 404
                  ? "NOT_FOUND"
                  : "ERROR";

      const fields = typeof res === "object" ? res?.fields : undefined;

      return new HttpException({ message, code, fields }, status);
    }

    // Unknown errors
    return new HttpException(
      { message: "Internal server error", code: "INTERNAL_SERVER_ERROR" },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

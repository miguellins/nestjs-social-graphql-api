## 1 - SEND TO CHATGPT ONCE:

I HAVE THIS EXCEPTION FILTER. THIS IS THE FILTER.

```TypeScript
import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

import { GqlArgumentsHost, GqlExceptionFilter } from "@nestjs/graphql";

import { Prisma } from "@prisma/client";

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
 * Global GraphQL exception filter that normalizes Prisma and Nest errors
 * into a consistent client-facing HttpException shape
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
```

Leave to the filter:
unexpected Prisma errors
generic fallback mapping when a service did not handle something
cross-cutting normalization of final GraphQL error shape

//---//---//---// //---//---//---// //---//---//---// //---//---//---//
//---//---//---// //---//---//---// //---//---//---// //---//---//---//

## 2 - SEND THIS TO CHATGPT FOR EVERY FUNCTION IN EVERY SERVICE

READ PRISMA DOCUMENTATION VERSION @prisma/client": "^6.19.2", "prisma": "^6.19.2":
Add Prisma error handling in the service when the error is expected and you can translate it into a meaningful domain response

Good times to handle Prisma errors in services:
when a unique constraint has business meaning
Example: P2002 for duplicate email, username, like, or follow
when a missing related record should map to a specific message
Example: P2003 / P2025 for “Post not found”, “User to follow not found”
when ownership/permission or workflow logic depends on the failed operation
when you want a better user-facing message than a generic DB error
when different Prisma codes should produce different app behavior

DO NOT add detailed Prisma handling when:
the service cannot add meaningful context
the error is unexpected or truly generic
a global fallback is enough

Practical rule for your project:
handle Prisma errors in write operations almost always
create
update
delete
transactions

handle them in reads when the DB error can be mapped to a useful domain result
otherwise let the global GraphQL exception filter be the fallback

APPLY THE BEST PRACTICE IN ERROR HANDLING FOR THIS, BASED IN THIS SERVICE:

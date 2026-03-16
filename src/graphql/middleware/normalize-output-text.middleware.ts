import type {
  FieldMiddleware,
  MiddlewareContext,
  NextFn,
} from "@nestjs/graphql";

/**
 * GraphQL field middleware for text output
 *
 * Trims string values before they are returned
 */

// Middleware that trims and normalizes whitespace in GraphQL string field outputs
export const normalizeOutputTextMiddleware: FieldMiddleware = async (
  _ctx: MiddlewareContext,
  next: NextFn,
) => {
  const value: unknown = await next();

  if (typeof value !== "string") return value;

  return value.trim().replace(/\s+/g, " ");
};

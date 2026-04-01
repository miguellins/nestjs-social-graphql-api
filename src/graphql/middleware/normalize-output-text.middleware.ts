import type {
  FieldMiddleware,
  MiddlewareContext,
  NextFn,
} from "@nestjs/graphql";

/** Field middleware that trims and normalizes whitespace in GraphQL string outputs. */
export const normalizeOutputTextMiddleware: FieldMiddleware = async (
  _ctx: MiddlewareContext,
  next: NextFn,
) => {
  const value: unknown = await next();

  if (typeof value !== "string") return value;

  return value.trim().replace(/\s+/g, " ");
};

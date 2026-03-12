import {
  type FieldMiddleware,
  type MiddlewareContext,
  type NextFn,
} from "@nestjs/graphql";

/**
 * Normalizes short output text before returning it to the client.
 * - trims leading/trailing whitespace
 * - collapses repeated internal whitespace
 */

export const normalizeOutputTextMiddleware: FieldMiddleware = async (
  _ctx: MiddlewareContext,
  next: NextFn,
) => {
  const value: unknown = await next();

  if (typeof value !== "string") return value;

  return value.trim().replace(/\s+/g, " ");
};

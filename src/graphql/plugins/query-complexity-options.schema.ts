import { z } from "zod";

/**
 * Zod schema for query complexity options
 *
 * Validates plugin configuration from the environment
 */

// Parses boolean complexity options from string input
const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return value;
}, z.boolean());

// Parses positive integer complexity options from string input
const positiveIntFromEnv = z.coerce.number().int().positive();

export const queryComplexityOptionsSchema = z.object({
  GRAPHQL_COMPLEXITY_ENFORCE: booleanFromEnv.default(false),
  GRAPHQL_COMPLEXITY_LOG: booleanFromEnv.default(true),
  GRAPHQL_COMPLEXITY_MAX: positiveIntFromEnv.default(500),
  GRAPHQL_COMPLEXITY_WARN_AT: positiveIntFromEnv.default(100),
  GRAPHQL_COMPLEXITY_MAX_QUERY_NODES: positiveIntFromEnv.default(2_000),
});

import { z } from "zod";

/**
 * Zod schema for environment variables
 *
 * Validates required configuration at startup
 */

// Parses positive integer environment values
const positiveIntFromEnv = z.coerce.number().int().positive();

// Parses boolean environment values from string input
const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return value;
}, z.boolean());

export const envSchema = z.object({
  PORT: positiveIntFromEnv.default(3000),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().trim().min(1).default("7d"),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: positiveIntFromEnv.default(30),
  PASSWORD_PEPPER: z.string().trim().min(1, "PASSWORD_PEPPER is required"),
  REDIS_URL: z.string().trim().min(1, "REDIS_URL is required"),
  GRAPHQL_SUBSCRIPTIONS_REDIS_URL: z.string().trim().min(1).optional(),
  GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE: z
    .string()
    .trim()
    .min(1)
    .default("graphql-subscriptions"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  GRAPHQL_COMPLEXITY_ENFORCE: booleanFromEnv.default(false),
  GRAPHQL_COMPLEXITY_LOG: booleanFromEnv.default(true),
  GRAPHQL_COMPLEXITY_WARN_AT: positiveIntFromEnv.default(100),
  GRAPHQL_COMPLEXITY_MAX: positiveIntFromEnv.default(500),
  GRAPHQL_COMPLEXITY_MAX_QUERY_NODES: positiveIntFromEnv.default(2_000),
});

type AppEnv = z.infer<typeof envSchema>;

// Validates the environment object during application bootstrap
export function validateEnv(config: Record<string, unknown>): AppEnv {
  return envSchema.parse(config);
}

import { z } from "zod";

/** Positive integer coercion helper for parsing env vars. */
const positiveIntFromEnv = z.coerce.number().int().positive();

/** Boolean coercion helper for parsing env vars. */
const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();

  if (normalized === "true") return true;
  if (normalized === "false") return false;

  return value;
}, z.boolean());

/** Zod schema for application environment variables. */
export const envSchema = z.object({
  PORT: positiveIntFromEnv.default(3000),
  DATABASE_URL: z.string().trim().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().trim().min(1, "JWT_SECRET is required"),
  JWT_EXPIRES_IN: z.string().trim().min(1).default("7d"),
  PASSWORD_RESET_TOKEN_TTL_MINUTES: positiveIntFromEnv.default(30),
  EMAIL_VERIFICATION_TTL_HOURS: positiveIntFromEnv.default(24),
  REFRESH_SESSION_TTL_DAYS: positiveIntFromEnv.default(30),
  PASSWORD_PEPPER: z.string().trim().min(1, "PASSWORD_PEPPER is required"),
  REDIS_URL: z.string().trim().min(1, "REDIS_URL is required"),
  GRAPHQL_SUBSCRIPTIONS_REDIS_URL: z.string().trim().min(1).optional(),
  GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE: z
    .string()
    .trim()
    .min(1)
    .default("graphql-subscriptions"),
  R2_ACCOUNT_ID: z.string().trim().min(1, "R2_ACCOUNT_ID is required"),
  R2_BUCKET: z.string().trim().min(1, "R2_BUCKET is required"),
  R2_ACCESS_KEY_ID: z.string().trim().min(1, "R2_ACCESS_KEY_ID is required"),
  R2_SECRET_ACCESS_KEY: z
    .string()
    .trim()
    .min(1, "R2_SECRET_ACCESS_KEY is required"),
  R2_PUBLIC_BASE_URL: z
    .string()
    .trim()
    .url("R2_PUBLIC_BASE_URL must be a valid URL"),
  R2_PRESIGNED_URL_TTL_SECONDS: positiveIntFromEnv.default(1800),
  MEDIA_IMAGE_MAX_BYTES: positiveIntFromEnv.default(10 * 1024 * 1024),
  MEDIA_VIDEO_MAX_BYTES: positiveIntFromEnv.default(100 * 1024 * 1024),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  GRAPHQL_COMPLEXITY_ENFORCE: booleanFromEnv.default(false),
  GRAPHQL_COMPLEXITY_LOG: booleanFromEnv.default(true),
  GRAPHQL_COMPLEXITY_WARN_AT: positiveIntFromEnv.default(100),
  GRAPHQL_COMPLEXITY_MAX: positiveIntFromEnv.default(500),
  GRAPHQL_COMPLEXITY_MAX_QUERY_NODES: positiveIntFromEnv.default(2_000),
  METRICS_ENABLED: booleanFromEnv.default(false),
  METRICS_HOST: z.string().trim().min(1).default("127.0.0.1"),
  METRICS_PORT: positiveIntFromEnv.default(9090),
  METRICS_DB_REFRESH_INTERVAL_MS: positiveIntFromEnv.default(15_000),
  OUTBOX_ENABLED: booleanFromEnv.default(false),
  OUTBOX_COMMENT_REPLIED_ENABLED: booleanFromEnv.default(false),
  OUTBOX_FOLLOW_REQUESTED_ENABLED: booleanFromEnv.default(false),
  OUTBOX_POLL_INTERVAL_MS: positiveIntFromEnv.default(1_000),
  OUTBOX_BATCH_SIZE: positiveIntFromEnv.default(20),
  OUTBOX_MAX_ATTEMPTS: positiveIntFromEnv.default(10),
  OUTBOX_PROCESSED_RETENTION_HOURS: positiveIntFromEnv.default(24),
  OUTBOX_FAILED_RETENTION_HOURS: positiveIntFromEnv.default(24 * 7),
  FEED_PROJECTION_ENQUEUE_ENABLED: booleanFromEnv.default(false),
  FEED_PROJECTION_WORKER_ENABLED: booleanFromEnv.default(false),
  FEED_PROJECTION_READ_ENABLED: booleanFromEnv.default(false),
  FEED_PROJECTION_BACKFILL_ENABLED: booleanFromEnv.default(false),
  FEED_PROJECTION_PURGE_ENABLED: booleanFromEnv.default(false),

  FEED_PROJECTION_RETENTION_DAYS: positiveIntFromEnv.default(90),
  FEED_PROJECTION_RETENTION_MAX_ITEMS_PER_USER:
    positiveIntFromEnv.default(10_000),
  FEED_PROJECTION_PURGE_INTERVAL_MS: positiveIntFromEnv.default(60_000),

  FEED_PROJECTION_FANOUT_BATCH_SIZE: positiveIntFromEnv.default(500),
  FEED_PROJECTION_FOLLOWER_PAGE_SIZE: positiveIntFromEnv.default(2_000),

  FEED_PROJECTION_SHADOW_COMPARE_ENABLED: booleanFromEnv.default(false),
  FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY: booleanFromEnv.default(true),
  FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.005),
  FEED_PROJECTION_SHADOW_COMPARE_FORCE_USER_ID: z.coerce
    .number()
    .int()
    .positive()
    .optional(),

  FEED_PROJECTION_READ_COHORT_ENABLED: booleanFromEnv.default(false),
  FEED_PROJECTION_READ_COHORT_SAMPLE_RATE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0),
  FEED_PROJECTION_READ_FORCE_USER_ID: z.coerce
    .number()
    .int()
    .positive()
    .optional(),
  FEED_PROJECTION_READ_REQUIRE_POPULATED: booleanFromEnv.default(true),
  FEED_PROJECTION_UNSAFE_MISSING_RATIO: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.5),

  MUTES_ENABLED: booleanFromEnv.default(false),
});

/** Type representing the validated application environment variables. */
type AppEnv = z.infer<typeof envSchema>;

/** Validates and parses the given config object into strongly-typed environment variables. */
export function validateEnv(config: Record<string, unknown>): AppEnv {
  return envSchema.parse(config);
}

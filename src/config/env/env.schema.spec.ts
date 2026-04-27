import { validateEnv } from "@/config/env/env.schema";

describe("validateEnv", () => {
  const baseEnv = {
    PORT: "3000",
    DATABASE_URL: "mysql://root:root@localhost:3307/mydb",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
    PASSWORD_PEPPER: "test-pepper",
    REDIS_URL: "redis://localhost:6379",
    R2_ACCOUNT_ID: "account-id",
    R2_BUCKET: "app-media-test",
    R2_ACCESS_KEY_ID: "access-key-id",
    R2_SECRET_ACCESS_KEY: "secret-access-key",
    R2_PUBLIC_BASE_URL: "https://cdn.example.com",
  };

  it("coerces numeric and boolean environment variables", () => {
    const result = validateEnv({
      ...baseEnv,
      GRAPHQL_COMPLEXITY_ENFORCE: "true",
      GRAPHQL_COMPLEXITY_LOG: "false",
      GRAPHQL_COMPLEXITY_WARN_AT: "120",
      GRAPHQL_COMPLEXITY_MAX: "600",
      GRAPHQL_COMPLEXITY_MAX_QUERY_NODES: "2500",
    });

    expect(result.PORT).toBe(3000);
    expect(result.GRAPHQL_COMPLEXITY_ENFORCE).toBe(true);
    expect(result.GRAPHQL_COMPLEXITY_LOG).toBe(false);
    expect(result.GRAPHQL_COMPLEXITY_WARN_AT).toBe(120);
    expect(result.GRAPHQL_COMPLEXITY_MAX).toBe(600);
    expect(result.GRAPHQL_COMPLEXITY_MAX_QUERY_NODES).toBe(2500);
  });

  it("applies defaults for optional environment variables", () => {
    const result = validateEnv(baseEnv);

    expect(result.PORT).toBe(3000);
    expect(result.JWT_EXPIRES_IN).toBe("7d");
    expect(result.PASSWORD_RESET_TOKEN_TTL_MINUTES).toBe(30);
    expect(result.GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE).toBe(
      "graphql-subscriptions",
    );
    expect(result.NODE_ENV).toBe("development");
    expect(result.GRAPHQL_COMPLEXITY_ENFORCE).toBe(false);
    expect(result.GRAPHQL_COMPLEXITY_LOG).toBe(true);
    expect(result.GRAPHQL_COMPLEXITY_WARN_AT).toBe(100);
    expect(result.GRAPHQL_COMPLEXITY_MAX).toBe(500);
    expect(result.GRAPHQL_COMPLEXITY_MAX_QUERY_NODES).toBe(2000);
    expect(result.OUTBOX_FOLLOW_REQUESTED_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_ENQUEUE_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_WORKER_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_READ_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_BACKFILL_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_PURGE_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_RETENTION_DAYS).toBe(90);
    expect(result.FEED_PROJECTION_RETENTION_MAX_ITEMS_PER_USER).toBe(10_000);
    expect(result.FEED_PROJECTION_PURGE_INTERVAL_MS).toBe(60_000);
    expect(result.FEED_PROJECTION_FANOUT_BATCH_SIZE).toBe(500);
    expect(result.FEED_PROJECTION_FOLLOWER_PAGE_SIZE).toBe(2000);
    expect(result.FEED_PROJECTION_SHADOW_COMPARE_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY).toBe(true);
    expect(result.FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE).toBe(0.005);
    expect(result.FEED_PROJECTION_SHADOW_COMPARE_FORCE_USER_ID).toBeUndefined();
    expect(result.FEED_PROJECTION_READ_COHORT_ENABLED).toBe(false);
    expect(result.FEED_PROJECTION_READ_COHORT_SAMPLE_RATE).toBe(0);
    expect(result.FEED_PROJECTION_READ_FORCE_USER_ID).toBeUndefined();
    expect(result.FEED_PROJECTION_READ_REQUIRE_POPULATED).toBe(true);
    expect(result.R2_PRESIGNED_URL_TTL_SECONDS).toBe(1800);
    expect(result.MEDIA_IMAGE_MAX_BYTES).toBe(10 * 1024 * 1024);
    expect(result.MEDIA_VIDEO_MAX_BYTES).toBe(100 * 1024 * 1024);
  });

  it("throws when a required variable is missing", () => {
    expect(() =>
      validateEnv({
        ...baseEnv,
        JWT_SECRET: "",
      }),
    ).toThrow();
  });
});

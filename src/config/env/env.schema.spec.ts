import { validateEnv } from "@/config/env/env.schema";

describe("validateEnv", () => {
  const baseEnv = {
    PORT: "3000",
    DATABASE_URL: "mysql://root:root@localhost:3307/mydb",
    JWT_SECRET: "test-secret",
    JWT_EXPIRES_IN: "7d",
    PASSWORD_PEPPER: "test-pepper",
    REDIS_URL: "redis://localhost:6379",
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
    expect(result.GRAPHQL_SUBSCRIPTIONS_REDIS_NAMESPACE).toBe(
      "graphql-subscriptions",
    );
    expect(result.NODE_ENV).toBe("development");
    expect(result.GRAPHQL_COMPLEXITY_ENFORCE).toBe(false);
    expect(result.GRAPHQL_COMPLEXITY_LOG).toBe(true);
    expect(result.GRAPHQL_COMPLEXITY_WARN_AT).toBe(100);
    expect(result.GRAPHQL_COMPLEXITY_MAX).toBe(500);
    expect(result.GRAPHQL_COMPLEXITY_MAX_QUERY_NODES).toBe(2000);
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

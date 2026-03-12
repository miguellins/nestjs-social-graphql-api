import { normalizeOutputTextMiddleware } from "@/graphql/middleware/normalize-output-text.middleware";

describe("normalizeOutputTextMiddleware", () => {
  it("trims and collapses whitespace for string values", async () => {
    const result: unknown = await normalizeOutputTextMiddleware(
      {} as never,
      () => Promise.resolve("  Hello   world  "),
    );

    expect(result).toBe("Hello world");
  });

  it("returns non-string values unchanged", async () => {
    const result: unknown = await normalizeOutputTextMiddleware(
      {} as never,
      () => Promise.resolve(null),
    );

    expect(result).toBeNull();
  });
});

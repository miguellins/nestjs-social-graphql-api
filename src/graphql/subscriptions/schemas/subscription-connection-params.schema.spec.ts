import { subscriptionConnectionParamsSchema } from "@/graphql/subscriptions/schemas/subscription-connection-params.schema";

describe("subscriptionConnectionParamsSchema", () => {
  it("extracts a bearer token from lowercase authorization", () => {
    const result = subscriptionConnectionParamsSchema.parse({
      authorization: "Bearer token-123",
    });

    expect(result).toBe("token-123");
  });

  it("extracts a bearer token from uppercase Authorization", () => {
    const result = subscriptionConnectionParamsSchema.parse({
      Authorization: "Bearer token-456",
    });

    expect(result).toBe("token-456");
  });

  it("throws when authorization is missing", () => {
    expect(() => subscriptionConnectionParamsSchema.parse({})).toThrow(
      "Missing authorization in websocket connection params",
    );
  });

  it("throws when the format is invalid", () => {
    expect(() =>
      subscriptionConnectionParamsSchema.parse({
        authorization: "token-only",
      }),
    ).toThrow("Authorization must be in format: Bearer <token>");
  });
});

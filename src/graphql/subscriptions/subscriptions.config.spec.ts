import { createGraphqlSubscriptionsConfig } from "@/graphql/subscriptions/subscriptions.config";

describe("createGraphqlSubscriptionsConfig", () => {
  it("attaches the authenticated user to subscription context", async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 7 }),
    };

    const config = createGraphqlSubscriptionsConfig(jwtService as never);
    const onConnect = config["graphql-ws"].onConnect;
    const extra: Record<string, unknown> = {};

    await onConnect({
      connectionParams: {
        authorization: "Bearer token-123",
      },
      extra,
    });

    expect(jwtService.verifyAsync).toHaveBeenCalledWith("token-123");
    expect(extra).toEqual({
      user: {
        id: 7,
      },
    });
  });

  it("rejects malformed connection params with a sanitized unauthorized error", async () => {
    const jwtService = {
      verifyAsync: jest.fn(),
    };

    const config = createGraphqlSubscriptionsConfig(jwtService as never);
    const onConnect = config["graphql-ws"].onConnect;

    await expect(
      onConnect({
        connectionParams: {},
        extra: {},
      }),
    ).rejects.toThrow("Unauthorized");

    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it("rejects invalid jwt tokens with a sanitized unauthorized error", async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error("invalid token")),
    };

    const config = createGraphqlSubscriptionsConfig(jwtService as never);
    const onConnect = config["graphql-ws"].onConnect;

    await expect(
      onConnect({
        connectionParams: {
          authorization: "Bearer token-123",
        },
        extra: {},
      }),
    ).rejects.toThrow("Unauthorized");
  });

  it("rejects tokens whose payload does not contain a numeric subject", async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: "7" }),
    };

    const config = createGraphqlSubscriptionsConfig(jwtService as never);
    const onConnect = config["graphql-ws"].onConnect;

    await expect(
      onConnect({
        connectionParams: {
          authorization: "Bearer token-123",
        },
        extra: {},
      }),
    ).rejects.toThrow("Unauthorized");
  });
});

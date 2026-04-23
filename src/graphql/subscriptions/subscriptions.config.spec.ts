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
        "x-request-id": "ws-request-1",
      },
      extra,
    });

    expect(jwtService.verifyAsync).toHaveBeenCalledWith("token-123");
    expect(extra).toEqual({
      requestId: "ws-request-1",
      user: {
        id: 7,
      },
    });
  });

  it("generates a websocket request id when the client does not provide one", async () => {
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

    expect(extra["user"]).toEqual({
      id: 7,
    });
    const requestId = extra["requestId"];

    expect(typeof requestId).toBe("string");
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
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

  it("preserves the authenticated role and trims request ids from array params", async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 7, role: "ADMIN" }),
    };

    const config = createGraphqlSubscriptionsConfig(jwtService as never);
    const onConnect = config["graphql-ws"].onConnect;
    const extra: Record<string, unknown> = {};

    await onConnect({
      connectionParams: {
        authorization: "Bearer token-123",
        "x-request-id": ["", "  ws-array-id  "],
      },
      extra,
    });

    expect(extra).toEqual({
      requestId: "ws-array-id",
      user: {
        id: 7,
        role: "ADMIN",
      },
    });
  });
});

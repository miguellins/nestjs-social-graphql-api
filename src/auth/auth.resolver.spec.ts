import type { GqlContext } from "@/graphql/config/graphql-context.types";

import { AuthResolver } from "./auth.resolver";

describe("AuthResolver", () => {
  it("forwards mySessions to the auth session service", async () => {
    const authSessionService = {
      mySessions: jest.fn().mockResolvedValue([]),
    };
    const resolver = new AuthResolver({} as never, authSessionService as never);

    await resolver.mySessions({ id: 3, sessionId: 7 });

    expect(authSessionService.mySessions).toHaveBeenCalledWith({
      id: 3,
      sessionId: 7,
    });
  });

  it("forwards logoutCurrentSession to the auth session service", async () => {
    const authSessionService = {
      logoutCurrentSession: jest
        .fn()
        .mockResolvedValue({ message: "Logged out successfully" }),
    };
    const resolver = new AuthResolver({} as never, authSessionService as never);

    await resolver.logoutCurrentSession({ id: 3, sessionId: 7 });

    expect(authSessionService.logoutCurrentSession).toHaveBeenCalledWith({
      id: 3,
      sessionId: 7,
    });
  });

  it("forwards revokeSession to the auth session service", async () => {
    const authSessionService = {
      revokeSession: jest
        .fn()
        .mockResolvedValue({ message: "Session revoked successfully" }),
    };
    const resolver = new AuthResolver({} as never, authSessionService as never);

    await resolver.revokeSession({ id: 3, sessionId: 7 }, 12);

    expect(authSessionService.revokeSession).toHaveBeenCalledWith(
      { id: 3, sessionId: 7 },
      12,
    );
  });

  it("forwards revokeOtherSessions to the auth session service", async () => {
    const authSessionService = {
      revokeOtherSessions: jest
        .fn()
        .mockResolvedValue({ message: "Other sessions revoked successfully" }),
    };
    const resolver = new AuthResolver({} as never, authSessionService as never);

    await resolver.revokeOtherSessions({ id: 3, sessionId: 7 });

    expect(authSessionService.revokeOtherSessions).toHaveBeenCalledWith({
      id: 3,
      sessionId: 7,
    });
  });

  it("passes request metadata to login and refreshSession", async () => {
    const authService = {
      login: jest
        .fn()
        .mockResolvedValue({ access_token: "a", refreshToken: "b" }),
      refreshSession: jest
        .fn()
        .mockResolvedValue({ access_token: "a", refreshToken: "b" }),
    };
    const resolver = new AuthResolver(authService as never, {} as never);
    const context: GqlContext = {
      req: {
        headers: {
          "user-agent": "Mozilla/5.0 Test Browser",
          "x-forwarded-for": "203.0.113.10, 10.0.0.1",
        },
        ip: "10.0.0.1",
      } as never,
    };

    await resolver.login({ username: "john", password: "pass12345" }, context);
    await resolver.refreshSession({ refreshToken: "token" }, context);

    expect(authService.login).toHaveBeenCalledWith(
      { username: "john", password: "pass12345" },
      {
        userAgent: "Mozilla/5.0 Test Browser",
        ipAddress: "203.0.113.10",
      },
    );
    expect(authService.refreshSession).toHaveBeenCalledWith(
      { refreshToken: "token" },
      {
        userAgent: "Mozilla/5.0 Test Browser",
        ipAddress: "203.0.113.10",
      },
    );
  });
});

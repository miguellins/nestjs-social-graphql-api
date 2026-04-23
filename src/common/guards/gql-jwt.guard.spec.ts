import { GqlExecutionContext } from "@nestjs/graphql";

import { ExecutionContext } from "@nestjs/common";

import { Reflector } from "@nestjs/core";

import { RequestContextService } from "@/common/request-context/request-context.service";

import { GqlJwtGuard } from "./gql-jwt.guard";

import type { Request } from "express";

const canActivateMock = jest.fn<
  Promise<boolean> | boolean,
  [ExecutionContext]
>();

jest.mock("@nestjs/passport", () => ({
  AuthGuard: jest.fn(() => {
    return class {
      canActivate(context: ExecutionContext): unknown {
        return canActivateMock(context);
      }
    };
  }),
}));

jest.mock("@nestjs/graphql", () => ({
  GqlExecutionContext: {
    create: jest.fn(),
  },
}));

describe("GqlJwtGuard", () => {
  let guard: GqlJwtGuard;
  let reflector: Reflector;
  let requestContextService: jest.Mocked<RequestContextService>;
  let setUserIdMock: jest.Mock;

  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    getType: jest.fn(() => "graphql"),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    canActivateMock.mockReset();
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    requestContextService = {
      run: jest.fn(),
      get: jest.fn(),
      getStore: jest.fn(),
      setRequestId: jest.fn(),
      setUserId: (setUserIdMock = jest.fn()),
      setOperationName: jest.fn(),
    } as unknown as jest.Mocked<RequestContextService>;
    guard = new GqlJwtGuard(reflector, requestContextService);

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };

    gqlExecutionContextMock.create.mockReturnValue({
      getInfo: jest.fn().mockReturnValue({ operation: { operation: "query" } }),
      getContext: jest.fn().mockReturnValue({ req: {} }),
    });
  });

  it("returns true for public routes even when passport auth fails", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    canActivateMock.mockRejectedValue(new Error("unauthorized"));

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(canActivateMock).toHaveBeenCalledWith(context);
    expect(setUserIdMock).not.toHaveBeenCalled();
  });

  it("delegates to passport guard for non-public routes", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    canActivateMock.mockReturnValue(true);

    const result = await guard.canActivate(context);

    expect(canActivateMock).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
    expect(setUserIdMock).not.toHaveBeenCalled();
  });

  it("extracts GraphQL request from context", () => {
    const req = { headers: {} } as Request;
    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };
    const createMock = gqlExecutionContextMock.create;
    createMock.mockReturnValue({
      getContext: jest.fn().mockReturnValue({ req }),
    });

    const result = guard.getRequest(context);

    expect(createMock).toHaveBeenCalledWith(context);
    expect(result).toBe(req);
  });

  it("allows authenticated subscriptions via context.extra.user", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };
    gqlExecutionContextMock.create.mockReturnValue({
      getInfo: jest
        .fn()
        .mockReturnValue({ operation: { operation: "subscription" } }),
      getContext: jest.fn().mockReturnValue({ extra: { user: { id: 1 } } }),
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(canActivateMock).not.toHaveBeenCalled();
    expect(setUserIdMock).toHaveBeenCalledWith(1);
  });

  it("stores the authenticated HTTP user id in request context", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };
    gqlExecutionContextMock.create.mockReturnValue({
      getInfo: jest.fn().mockReturnValue({ operation: { operation: "query" } }),
      getContext: jest.fn().mockReturnValue({ req: { user: { id: 7 } } }),
    });
    canActivateMock.mockResolvedValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(setUserIdMock).toHaveBeenCalledWith(7);
  });

  it("returns true for public HTTP routes without invoking passport auth", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const httpContext = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      getType: jest.fn(() => "http"),
      switchToHttp: jest.fn(() => ({
        getRequest: jest.fn(() => ({ headers: {} })),
      })),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(httpContext)).resolves.toBe(true);
    expect(canActivateMock).not.toHaveBeenCalled();
  });
});

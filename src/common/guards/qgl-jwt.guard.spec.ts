import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";
import { Request } from "express";

const canActivateMock = jest.fn<unknown, [ExecutionContext]>();

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

import { GqlJwtGuard } from "./qgl-jwt.guard";

describe("GqlJwtGuard", () => {
  let guard: GqlJwtGuard;
  let reflector: Reflector;

  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(() => {
    canActivateMock.mockReset();
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    guard = new GqlJwtGuard(reflector);

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };

    gqlExecutionContextMock.create.mockReturnValue({
      getInfo: jest.fn().mockReturnValue({ operation: { operation: "query" } }),
      getContext: jest.fn().mockReturnValue({ req: {} }),
    });
  });

  it("returns true for public routes", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(canActivateMock).not.toHaveBeenCalled();
  });

  it("delegates to passport guard for non-public routes", async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    canActivateMock.mockReturnValue(true);

    const result = await guard.canActivate(context);

    expect(canActivateMock).toHaveBeenCalledWith(context);
    expect(result).toBe(true);
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
  });
});

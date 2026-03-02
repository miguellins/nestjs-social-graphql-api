import { ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { Request, Response } from "express";

jest.mock("@nestjs/graphql", () => ({
  GqlExecutionContext: {
    create: jest.fn(),
  },
}));

import { GqlThrottlerGuard } from "./qgl-throttler.guard";

describe("GqlThrottlerGuard", () => {
  it("adapts GraphQL context to req/res expected by ThrottlerGuard", () => {
    // Avoid constructor DI requirements from ThrottlerGuard in unit test context.
    const guard = Object.create(
      GqlThrottlerGuard.prototype,
    ) as GqlThrottlerGuard;
    const context = {} as ExecutionContext;

    const req = { ip: "127.0.0.1" } as Request;
    const res = { statusCode: 200 } as Response;

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };
    const createMock = gqlExecutionContextMock.create;
    createMock.mockReturnValue({
      getContext: jest.fn().mockReturnValue({ req, res }),
    });

    const result = (
      guard as unknown as {
        getRequestResponse: (executionContext: ExecutionContext) => {
          req: Request;
          res: Response;
        };
      }
    ).getRequestResponse(context);

    expect(createMock).toHaveBeenCalledWith(context);
    expect(result).toEqual({ req, res });
  });
});

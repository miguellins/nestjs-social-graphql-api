import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GqlExecutionContext } from "@nestjs/graphql";

import { USER_ROLE } from "@/users/enums/user-role.enum";
import { GqlRolesGuard } from "./gql-roles.guard";

jest.mock("@nestjs/graphql", () => ({
  GqlExecutionContext: {
    create: jest.fn(),
  },
}));

describe("GqlRolesGuard", () => {
  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
  } as never;

  let guard: GqlRolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as Reflector;
    guard = new GqlRolesGuard(reflector);
  });

  it("allows routes without role metadata", () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows users with a required role", () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([USER_ROLE.MODERATOR, USER_ROLE.ADMIN]);

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };
    gqlExecutionContextMock.create.mockReturnValue({
      getContext: jest.fn().mockReturnValue({
        req: { user: { id: 1, role: USER_ROLE.MODERATOR } },
      }),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("allows subscription contexts that carry an authorized user in extra.user", () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([USER_ROLE.MODERATOR, USER_ROLE.ADMIN]);

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };
    gqlExecutionContextMock.create.mockReturnValue({
      getContext: jest.fn().mockReturnValue({
        extra: { user: { id: 2, role: USER_ROLE.ADMIN } },
      }),
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it("rejects users without a required role", () => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([USER_ROLE.MODERATOR, USER_ROLE.ADMIN]);

    const gqlExecutionContextMock = GqlExecutionContext as unknown as {
      create: jest.Mock;
    };
    gqlExecutionContextMock.create.mockReturnValue({
      getContext: jest.fn().mockReturnValue({
        req: { user: { id: 1, role: USER_ROLE.USER } },
      }),
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

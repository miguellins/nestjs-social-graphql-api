import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "@/common/decorators/auth.decorator";

import { OperationTypeNode, type GraphQLResolveInfo } from "graphql";

import type { Request } from "express";

/** Represents the minimal authenticated user payload attached to requests. */
type AuthenticatedUser = {
  id: number;
};

/** Describes the GraphQL context shape used by the JWT guard. */
type GraphQLContext = {
  req?: Request & {
    user?: AuthenticatedUser;
  };
  extra?: {
    user?: AuthenticatedUser;
  };
};

/** Enforces JWT authentication for GraphQL operations with public-route opt-out. */
@Injectable()
export class GqlJwtGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<GraphQLResolveInfo>();
    const operation = info.operation.operation;
    const ctx = gqlContext.getContext<GraphQLContext>();

    if (operation === OperationTypeNode.SUBSCRIPTION) {
      if (!ctx.extra?.user) {
        throw new UnauthorizedException("Unauthorized");
      }

      return true;
    }

    return (await super.canActivate(context)) as boolean;
  }

  override getRequest(
    context: ExecutionContext,
  ): Request & { user?: AuthenticatedUser } {
    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext<GraphQLContext>();

    if (!ctx.req) throw new UnauthorizedException("Request not available");

    return ctx.req;
  }
}

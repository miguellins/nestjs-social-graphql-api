import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";

import type { Request } from "express";
import { GraphQLResolveInfo, OperationTypeNode } from "graphql";

import { IS_PUBLIC_KEY } from "@/common/decorators/auth.decorator";

type AuthenticatedUser = {
  id: number;
};

type GraphQLContext = {
  req?: Request & {
    user?: AuthenticatedUser;
  };
  extra?: {
    user?: AuthenticatedUser;
  };
};

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

    // Subscriptions are authenticated during the WebSocket handshake
    // and the user is usually attached to context.extra
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

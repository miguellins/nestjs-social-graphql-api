import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { RequestContextService } from "@/common/request-context/request-context.service";
import { IS_PUBLIC_KEY } from "@/common/decorators/auth.decorator";

import { OperationTypeNode, type GraphQLResolveInfo } from "graphql";

import type { Request } from "express";

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
  constructor(
    private readonly reflector: Reflector,
    private readonly requestContextService: RequestContextService,
  ) {
    super();
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (context.getType<string>() !== "graphql") {
      if (isPublic) {
        return true;
      }

      const result = (await super.canActivate(context)) as boolean;
      this.setCurrentUserId(this.getHttpRequest(context).user);
      return result;
    }

    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<GraphQLResolveInfo>();
    const operation = info.operation.operation;
    const ctx = gqlContext.getContext<GraphQLContext>();

    if (operation === OperationTypeNode.SUBSCRIPTION) {
      if (!ctx.extra?.user) {
        throw new UnauthorizedException("Unauthorized");
      }

      this.setCurrentUserId(ctx.extra.user);
      return true;
    }

    if (isPublic) {
      try {
        await super.canActivate(context);
      } catch {
        return true;
      }

      this.setCurrentUserId(ctx.req?.user);
      return true;
    }

    const result = (await super.canActivate(context)) as boolean;
    this.setCurrentUserId(ctx.req?.user);
    return result;
  }

  override getRequest(
    context: ExecutionContext,
  ): Request & { user?: AuthenticatedUser } {
    if (context.getType<string>() !== "graphql") {
      return this.getHttpRequest(context);
    }

    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext<GraphQLContext>();

    if (!ctx.req) throw new UnauthorizedException("Request not available");

    return ctx.req;
  }

  private setCurrentUserId(user: AuthenticatedUser | undefined): void {
    if (typeof user?.id === "number") {
      this.requestContextService.setUserId(user.id);
    }
  }

  private getHttpRequest(
    context: ExecutionContext,
  ): Request & { user?: AuthenticatedUser } {
    return context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
  }
}

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
import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import type { GraphQLResolveInfo } from "graphql/type/definition";
import { OperationTypeNode } from "graphql/language/ast";

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
    private readonly metricsRegistry: MetricsRegistryService,
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

      try {
        const result = (await super.canActivate(context)) as boolean;
        this.setCurrentUserId(this.getHttpRequest(context).user);
        if (!result) this.recordAuthFailure("unauthorized");
        return result;
      } catch (error) {
        this.recordAuthFailure("unauthorized");
        throw error;
      }
    }

    const gqlContext = GqlExecutionContext.create(context);
    const info = gqlContext.getInfo<GraphQLResolveInfo>();
    const operation = info.operation.operation;
    const ctx = gqlContext.getContext<GraphQLContext>();

    if (operation === OperationTypeNode.SUBSCRIPTION) {
      if (!ctx.extra?.user) {
        this.recordAuthFailure("unauthorized");
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

    try {
      const result = (await super.canActivate(context)) as boolean;
      this.setCurrentUserId(ctx.req?.user);
      if (!result) this.recordAuthFailure("unauthorized");
      return result;
    } catch (error) {
      this.recordAuthFailure("unauthorized");
      throw error;
    }
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

  /** Stores the authenticated user id in the request context when present. */
  private setCurrentUserId(user: AuthenticatedUser | undefined): void {
    if (typeof user?.id === "number") {
      this.requestContextService.setUserId(user.id);
    }
  }

  /** Extracts the HTTP request from a non-GraphQL execution context. */
  private getHttpRequest(
    context: ExecutionContext,
  ): Request & { user?: AuthenticatedUser } {
    return context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
  }

  /** Records authentication failures defensively. */
  private recordAuthFailure(reason: "unauthorized"): void {
    try {
      this.metricsRegistry.incrementAuthFailure(reason);
    } catch {
      // Metrics must never affect guard behavior.
    }
  }
}

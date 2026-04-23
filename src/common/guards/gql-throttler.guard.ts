import { ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";

import { OperationTypeNode, type GraphQLResolveInfo } from "graphql";

import type { Request, Response } from "express";

/** Describes the GraphQL context shape required by the throttler guard. */
type GraphQLContext = {
  req: Request;
  res: Response;
};

/** Applies HTTP throttling to GraphQL operations that expose request/response objects. */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== "graphql") {
      return super.canActivate(context);
    }

    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo<GraphQLResolveInfo>();
    const operation = info.operation.operation;

    if (operation === OperationTypeNode.SUBSCRIPTION) return true;

    return super.canActivate(context);
  }

  /**
   * ThrottlerGuard expects an HTTP req/res
   * GraphQL resolvers run under a GraphQL ExecutionContext
   * So we adapt it by extracting req/res from the GQL context
   */
  protected getRequestResponse(context: ExecutionContext): {
    req: Request;
    res: Response;
  } {
    if (context.getType<string>() !== "graphql") {
      const http = context.switchToHttp();

      return {
        req: http.getRequest<Request>(),
        res: http.getResponse<Response>(),
      };
    }

    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext<GraphQLContext>();

    return {
      req: ctx.req,
      res: ctx.res,
    };
  }
}

import { ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";

import { type Request, Response } from "express";

import { GraphQLResolveInfo, OperationTypeNode } from "graphql";

type GraphQLContext = {
  req: Request;
  res: Response;
};

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo<GraphQLResolveInfo>();
    const operation = info.operation.operation;

    // GraphQL subscriptions run over websocket and do not expose HTTP req/res
    // Skip HTTP throttling logic for subscription handshake/events
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
    const gqlContext = GqlExecutionContext.create(context);
    const ctx = gqlContext.getContext<GraphQLContext>();

    return {
      req: ctx.req,
      res: ctx.res,
    };
  }
}

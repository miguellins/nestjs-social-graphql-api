import { ExecutionContext, Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { GqlExecutionContext } from "@nestjs/graphql";
import { type Request, Response } from "express";

type GraphQLContext = {
  req: Request;
  res: Response;
};

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  /**
   * ThrottlerGuard expects an HTTP req/res.
   * GraphQL resolvers run under a GraphQL ExecutionContext.
   * So we adapt it by extracting req/res from the GQL context.
   */
  protected getRequestResponse(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);

    const ctx = gqlCtx.getContext<GraphQLContext>();

    return { req: ctx.req, res: ctx.res };
  }
}

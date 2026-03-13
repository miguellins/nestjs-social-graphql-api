import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";

import type { GqlContext } from "@/app.module";

/**
 * GraphQL parameter decorator that extracts the authenticated user
 * from either the HTTP request context or the subscription context
 */

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const gqlCtx = GqlExecutionContext.create(context).getContext<GqlContext>();

    // Supports both HTTP resolvers (req.user) and subscription context (extra.user)
    return gqlCtx.req?.user ?? gqlCtx.extra?.user ?? null;
  },
);

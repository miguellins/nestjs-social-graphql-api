import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";

import type { GqlContext } from "@/graphql/config/graphql-context.types";

/**
 * GraphQL parameter decorator for the current user
 *
 * Reads the authenticated user from the GraphQL context
 */

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const gqlCtx = GqlExecutionContext.create(context).getContext<GqlContext>();

    // Supports both HTTP resolvers (req.user) and subscription context (extra.user)
    return gqlCtx.req?.user ?? gqlCtx.extra?.user ?? null;
  },
);

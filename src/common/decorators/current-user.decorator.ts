import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";

import type { GqlContext } from "@/graphql/config/graphql-context.types";

/** GraphQL param decorator to inject the currently authenticated user or null. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const gqlCtx = GqlExecutionContext.create(context).getContext<GqlContext>();

    return gqlCtx.req?.user ?? gqlCtx.extra?.user ?? null;
  },
);

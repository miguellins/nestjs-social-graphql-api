import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";

type GraphQLContext = {
  req: {
    user?:
      | {
          id: number;
          username?: string;
        }
      | undefined;
  };
};

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const ctx = GqlExecutionContext.create(context);

    const gqlCtx = ctx.getContext<GraphQLContext>();

    return gqlCtx.req.user ?? null;
  },
);

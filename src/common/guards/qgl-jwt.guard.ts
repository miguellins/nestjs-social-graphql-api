import { ExecutionContext, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { AuthGuard } from "@nestjs/passport";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY } from "../decorators/auth.decorator";

type GraphQLContext = {
  req: Request & {
    user?: {
      id: number;
      username?: string;
    };
  };
};

@Injectable()
export class GqlJwtGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    return super.canActivate(context);
  }

  getRequest(context: ExecutionContext) {
    const gqlCtx = GqlExecutionContext.create(context);
    const ctx = gqlCtx.getContext<GraphQLContext>();
    return ctx.req;
  }
}

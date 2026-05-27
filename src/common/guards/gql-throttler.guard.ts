import { ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { ThrottlerGuard } from "@nestjs/throttler";

import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import type { GraphQLResolveInfo } from "graphql/type/definition";
import { OperationTypeNode } from "graphql/language/ast";

import type { Request, Response } from "express";

/** Describes the GraphQL context shape required by the throttler guard. */
type GraphQLContext = {
  req: Request;
  res: Response;
};

/** Applies HTTP throttling to GraphQL operations that expose request/response objects. */
@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  @Inject(MetricsRegistryService)
  private readonly metricsRegistry!: MetricsRegistryService;

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() !== "graphql") {
      return this.activateWithMetrics(context);
    }

    const gqlCtx = GqlExecutionContext.create(context);
    const info = gqlCtx.getInfo<GraphQLResolveInfo>();
    const operation = info.operation.operation;

    if (operation === OperationTypeNode.SUBSCRIPTION) return true;

    return this.activateWithMetrics(context);
  }

  /** Adapts GraphQL and HTTP contexts to the request/response shape expected by ThrottlerGuard. */
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

  /** Runs base throttling and records rejected requests defensively. */
  private async activateWithMetrics(
    context: ExecutionContext,
  ): Promise<boolean> {
    try {
      const result = await super.canActivate(context);
      if (!result) this.recordThrottleRejection();
      return result;
    } catch (error) {
      this.recordThrottleRejection();
      throw error;
    }
  }

  /** Records throttle rejections defensively. */
  private recordThrottleRejection(): void {
    try {
      this.metricsRegistry.incrementThrottleRejection();
    } catch {
      // Metrics must never affect guard behavior.
    }
  }
}

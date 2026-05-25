import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { GqlExecutionContext } from "@nestjs/graphql";
import { Reflector } from "@nestjs/core";

import { IS_PUBLIC_KEY, ROLES_KEY } from "@/common/decorators/auth.decorator";
import { MetricsRegistryService } from "@/metrics/metrics-registry.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import type { GqlContext } from "@/graphql/config/graphql-context.types";

import type { UserRole } from "@/users/enums/user-role.enum";

/** Global GraphQL role guard that restricts selected operations to moderator/admin users. */
@Injectable()
export class GqlRolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly metricsRegistry: MetricsRegistryService,
  ) {}

  /** Allows requests with required roles and records forbidden outcomes. */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    if (context.getType<string>() !== "graphql") {
      const currentUser = context.switchToHttp().getRequest<{
        user?: AuthenticatedUser;
      }>().user;

      if (!currentUser?.role || !requiredRoles.includes(currentUser.role)) {
        this.recordForbidden();
        throw new ForbiddenException("Forbidden resource");
      }

      return true;
    }

    const gqlContext =
      GqlExecutionContext.create(context).getContext<GqlContext>();
    const currentUser = gqlContext.req?.user ?? gqlContext.extra?.user;

    if (!currentUser?.role || !requiredRoles.includes(currentUser.role)) {
      this.recordForbidden();
      throw new ForbiddenException("Forbidden resource");
    }

    return true;
  }

  /** Records forbidden auth failures defensively. */
  private recordForbidden(): void {
    try {
      this.metricsRegistry.incrementAuthFailure("forbidden");
    } catch {
      // Metrics must never affect guard behavior.
    }
  }
}

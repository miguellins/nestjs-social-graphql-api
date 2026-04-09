import { SetMetadata } from "@nestjs/common";

import type { UserRole } from "@/users/enums/user-role.enum";

/**
 * Marks a GraphQL resolver or route as public (bypassing global auth guards).
 *
 * Usage:
 *   @Public()
 *   someQueryOrMutation(...) { ... }
 *
 * The accompanying IS_PUBLIC_KEY metadata is checked by the JWT guard
 * to optionally allow unauthenticated access.
 */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Restricts a GraphQL resolver or route to a specific set of authenticated user roles.
 *
 * Usage:
 *   @Roles(...)
 *   someQueryOrMutation(...) { ... }
 *
 * The accompanying ROLES_KEY metadata is checked by the roles guard
 * to allow only authenticated users with one of the required roles.
 */
export const ROLES_KEY = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

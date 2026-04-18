import type { UserRole } from "@/users/enums/user-role.enum";

/** Authenticated user payload attached to GraphQL request and subscription contexts. */
export type AuthenticatedUser = {
  id: number;
  role?: UserRole;
  sessionId?: number;
};

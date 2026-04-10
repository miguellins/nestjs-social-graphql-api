/** Declares the supported account roles used for moderation authorization. */
export const USER_ROLE = {
  USER: "USER",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
} as const;

/** Union of supported account role values. */
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

/** Reusable role list for moderator/admin-only operations. */
export const MODERATION_ROLES = [
  USER_ROLE.MODERATOR,
  USER_ROLE.ADMIN,
] as const satisfies readonly UserRole[];

/** Reusable role lookup for moderator/admin-only service checks. */
export const MODERATION_ROLE_SET = new Set<UserRole>(MODERATION_ROLES);

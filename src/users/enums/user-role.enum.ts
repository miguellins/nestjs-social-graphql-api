/** Declares the supported account roles used for moderation authorization. */
export const USER_ROLE = {
  USER: "USER",
  MODERATOR: "MODERATOR",
  ADMIN: "ADMIN",
} as const;

/** Union of supported account role values. */
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

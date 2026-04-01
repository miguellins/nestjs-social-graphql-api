/**
 * Shared username validation constants for the users domain
 */

/** Regex allowing only letters, numbers, and underscores for username validation. */
export const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

/** Error message for when the username does not match the allowed pattern. */
export const USERNAME_REGEX_MESSAGE =
  "username can only contain letters, numbers and underscore";

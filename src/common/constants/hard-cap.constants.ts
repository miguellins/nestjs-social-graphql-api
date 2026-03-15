/**
 * Shared pagination and hard-cap values for GraphQL list queries
 *
 * MAX_TAKE / DEFAULT_TAKE:
 * - Default and maximum values for general paginated list endpoints
 *
 * MAX_TAKE_LIKES / DEFAULT_TAKE_LIKES:
 * - Default and maximum values for nested likes previews on post detail queries
 */

export const PAGINATION = {
  MAX_TAKE: 50,
  DEFAULT_TAKE: 20,
  MAX_TAKE_LIKES: 50,
  DEFAULT_TAKE_LIKES: 20,
} as const;

/**
 * Pagination constants for API queries
 *
 * MAX_TAKE: Hard cap on records per request (prevents overload)
 * DEFAULT_TAKE: Default number of records when not specified
 *
 * Usage:
 * const limit = Math.min(params?.take ?? PAGINATION.DEFAULT_TAKE, PAGINATION.MAX_TAKE);
 */

export const PAGINATION = {
  MAX_TAKE: 50,
  DEFAULT_TAKE: 20,
} as const;

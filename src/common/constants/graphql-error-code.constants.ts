/** Stable public GraphQL error codes returned to API consumers. */
export const GRAPHQL_ERROR_CODES = {
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE: "DUPLICATE",
  FOREIGN_KEY: "FOREIGN_KEY",
  DB_ERROR: "DB_ERROR",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
  ERROR: "ERROR",
} as const;

/** Union of stable public GraphQL error code values. */
export type GraphqlErrorCode =
  (typeof GRAPHQL_ERROR_CODES)[keyof typeof GRAPHQL_ERROR_CODES];

import type {
  ApolloServerPlugin,
  GraphQLRequestContextWillSendResponse,
  GraphQLRequestListener,
} from "@apollo/server";

import type { GraphQLFormattedError } from "graphql";

const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_BAD_REQUEST = 400;
const PUBLIC_BAD_REQUEST_CODE = "BAD_REQUEST";

/** Narrows unknown response values to formatted GraphQL errors. */
function isFormattedError(value: unknown): value is GraphQLFormattedError {
  return typeof value === "object" && value !== null && "message" in value;
}

/** Returns true when the single-result response only contains sanitized bad-request GraphQL errors. */
function shouldForceBadRequestStatus(errors: readonly unknown[]): boolean {
  return (
    errors.length > 0 &&
    errors.every((error) => {
      if (!isFormattedError(error)) return false;

      return error.extensions?.["code"] === PUBLIC_BAD_REQUEST_CODE;
    })
  );
}

/** Ensures sanitized GraphQL validation/input errors use HTTP 400 instead of leaking as transport 500s. */
export function createBadRequestStatusPlugin(): ApolloServerPlugin<object> {
  return {
    requestDidStart(): Promise<GraphQLRequestListener<object>> {
      return Promise.resolve({
        willSendResponse(
          requestContext: GraphQLRequestContextWillSendResponse<object>,
        ): Promise<void> {
          const httpStatus = requestContext.response.http.status;
          const body = requestContext.response.body;

          if (
            typeof httpStatus !== "number" ||
            httpStatus < HTTP_INTERNAL_SERVER_ERROR ||
            body.kind !== "single"
          ) {
            return Promise.resolve();
          }

          const errors = body.singleResult.errors ?? [];

          if (!shouldForceBadRequestStatus(errors)) {
            return Promise.resolve();
          }

          requestContext.response.http.status = HTTP_BAD_REQUEST;
          return Promise.resolve();
        },
      });
    },
  };
}

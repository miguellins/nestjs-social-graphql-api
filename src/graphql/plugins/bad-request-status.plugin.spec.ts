import { createBadRequestStatusPlugin } from "@/graphql/plugins/bad-request-status.plugin";

import type { GraphQLRequestContextWillSendResponse } from "@apollo/server";

type TestRequestContext = GraphQLRequestContextWillSendResponse<object>;

describe("bad-request-status.plugin", () => {
  it("forces HTTP 400 for sanitized GraphQL bad-request errors", async () => {
    const plugin = createBadRequestStatusPlugin();
    const listener = await plugin.requestDidStart?.({} as never);
    const requestContext: TestRequestContext = {
      logger: console,
      cache: {} as never,
      request: {},
      schema: {} as never,
      contextValue: {},
      metrics: {},
      overallCachePolicy: {} as never,
      requestIsBatched: false,
      source: "",
      queryHash: "",
      response: {
        http: {
          status: 500,
          headers: new Map(),
        },
        body: {
          kind: "single",
          singleResult: {
            errors: [
              {
                message: "Invalid value for input.username.",
                extensions: {
                  code: "BAD_REQUEST",
                },
              },
            ],
          },
        },
      },
    };

    await listener?.willSendResponse?.(requestContext);

    expect(requestContext.response.http.status).toBe(400);
  });

  it("forces HTTP 400 for sanitized GraphQL schema validation errors", async () => {
    const plugin = createBadRequestStatusPlugin();
    const listener = await plugin.requestDidStart?.({} as never);
    const requestContext: TestRequestContext = {
      logger: console,
      cache: {} as never,
      request: {},
      schema: {} as never,
      contextValue: {},
      metrics: {},
      overallCachePolicy: {} as never,
      requestIsBatched: false,
      source: "",
      queryHash: "",
      response: {
        http: {
          status: 500,
          headers: new Map(),
        },
        body: {
          kind: "single",
          singleResult: {
            errors: [
              {
                message: 'Cannot query field "user" on type "AuthPayload".',
                extensions: {
                  code: "BAD_REQUEST",
                },
              },
            ],
          },
        },
      },
    };

    await listener?.willSendResponse?.(requestContext);

    expect(requestContext.response.http.status).toBe(400);
  });

  it("does not rewrite genuine internal server errors", async () => {
    const plugin = createBadRequestStatusPlugin();
    const listener = await plugin.requestDidStart?.({} as never);
    const requestContext: TestRequestContext = {
      logger: console,
      cache: {} as never,
      request: {},
      schema: {} as never,
      contextValue: {},
      metrics: {},
      overallCachePolicy: {} as never,
      requestIsBatched: false,
      source: "",
      queryHash: "",
      response: {
        http: {
          status: 500,
          headers: new Map(),
        },
        body: {
          kind: "single",
          singleResult: {
            errors: [
              {
                message: "Internal server error",
                extensions: {
                  code: "INTERNAL_SERVER_ERROR",
                },
              },
            ],
          },
        },
      },
    };

    await listener?.willSendResponse?.(requestContext);

    expect(requestContext.response.http.status).toBe(500);
  });

  it("does not rewrite responses already using a non-500 status", async () => {
    const plugin = createBadRequestStatusPlugin();
    const listener = await plugin.requestDidStart?.({} as never);
    const requestContext: TestRequestContext = {
      logger: console,
      cache: {} as never,
      request: {},
      schema: {} as never,
      contextValue: {},
      metrics: {},
      overallCachePolicy: {} as never,
      requestIsBatched: false,
      source: "",
      queryHash: "",
      response: {
        http: {
          status: 400,
          headers: new Map(),
        },
        body: {
          kind: "single",
          singleResult: {
            errors: [
              {
                message: 'Cannot query field "missing" on type "Query".',
                extensions: {
                  code: "BAD_REQUEST",
                },
              },
            ],
          },
        },
      },
    };

    await listener?.willSendResponse?.(requestContext);

    expect(requestContext.response.http.status).toBe(400);
  });
});

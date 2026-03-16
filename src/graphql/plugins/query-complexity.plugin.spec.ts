import { Logger } from "@nestjs/common";

import { buildSchema, parse } from "graphql";

import {
  createQueryComplexityPlugin,
  getQueryComplexityPluginOptions,
} from "@/graphql/plugins/query-complexity.plugin";

describe("query-complexity.plugin", () => {
  const schema = buildSchema(`
    type Query {
      ping: String!
      nested: Nested!
    }

    type Nested {
      value: String!
    }
  `);

  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it("uses rollout-safe defaults", () => {
    expect(getQueryComplexityPluginOptions({} as NodeJS.ProcessEnv)).toEqual({
      enforce: false,
      log: true,
      maxComplexity: 500,
      warnAt: 100,
      maxQueryNodes: 2_000,
    });
  });

  it("throws when a positive integer option is invalid", () => {
    expect(() =>
      getQueryComplexityPluginOptions({
        GRAPHQL_COMPLEXITY_MAX: "0",
      }),
    ).toThrow();
  });

  it("logs normal operation complexity without rejecting the request", async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    const plugin = createQueryComplexityPlugin({
      GRAPHQL_COMPLEXITY_ENFORCE: "false",
      GRAPHQL_COMPLEXITY_LOG: "true",
    });

    const listener = await plugin.requestDidStart?.({} as never);

    await expect(
      listener?.didResolveOperation?.({
        schema,
        document: parse(`
          query Ping {
            ping
          }
        `),
        request: {
          operationName: "Ping",
          variables: {},
        },
        operationName: "Ping",
        operation: {
          operation: "query",
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("rejects operations that exceed the configured maximum when enforcement is enabled", async () => {
    const plugin = createQueryComplexityPlugin({
      GRAPHQL_COMPLEXITY_ENFORCE: "true",
      GRAPHQL_COMPLEXITY_LOG: "false",
      GRAPHQL_COMPLEXITY_MAX: "1",
    });

    const listener = await plugin.requestDidStart?.({} as never);

    await expect(
      listener?.didResolveOperation?.({
        schema,
        document: parse(`
          query TooDeep {
            nested {
              value
            }
          }
        `),
        request: {
          operationName: "TooDeep",
          variables: {},
        },
        operationName: "TooDeep",
        operation: {
          operation: "query",
        },
      } as never),
    ).rejects.toThrow("Query is too complex: 2. Maximum allowed complexity: 1");
  });

  it("skips introspection operations", async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, "log")
      .mockImplementation(() => undefined);
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    const plugin = createQueryComplexityPlugin({
      GRAPHQL_COMPLEXITY_LOG: "true",
    });

    const listener = await plugin.requestDidStart?.({} as never);

    await expect(
      listener?.didResolveOperation?.({
        schema,
        document: parse(`
          query IntrospectionQuery {
            __schema {
              queryType {
                name
              }
            }
          }
        `),
        request: {
          operationName: "IntrospectionQuery",
          variables: {},
        },
        operationName: "IntrospectionQuery",
        operation: {
          operation: "query",
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when a query reaches the configured threshold", async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    const plugin = createQueryComplexityPlugin({
      GRAPHQL_COMPLEXITY_LOG: "true",
      GRAPHQL_COMPLEXITY_WARN_AT: "1",
    });

    const listener = await plugin.requestDidStart?.({} as never);

    await expect(
      listener?.didResolveOperation?.({
        schema,
        document: parse(`
          query Ping {
            ping
          }
        `),
        request: {
          operationName: "Ping",
          variables: {},
        },
        operationName: "Ping",
        operation: {
          operation: "query",
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith("operation=Ping complexity=1");
  });

  it("skips introspection selections even without the standard operation name", async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);

    const plugin = createQueryComplexityPlugin({
      GRAPHQL_COMPLEXITY_LOG: "true",
    });

    const listener = await plugin.requestDidStart?.({} as never);

    await expect(
      listener?.didResolveOperation?.({
        schema,
        document: parse(`
          query SchemaExplorer {
            __schema {
              queryType {
                name
              }
            }
          }
        `),
        request: {
          operationName: "SchemaExplorer",
          variables: {},
        },
        operationName: "SchemaExplorer",
        operation: {
          operation: "query",
          selectionSet: {
            kind: "SelectionSet",
            selections: [
              {
                kind: "Field",
                name: { kind: "Name", value: "__schema" },
              },
            ],
          },
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

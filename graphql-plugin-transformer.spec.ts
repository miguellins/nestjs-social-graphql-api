import jestConfig from "./jest.config";

jest.mock("@nestjs/graphql/plugin", () => ({
  before: jest.fn(),
}));

describe("graphql-plugin-transformer", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("exports stable metadata for tooling", () => {
    const transformer = require("./graphql-plugin-transformer.cjs");

    expect(transformer.name).toBe("nestjs-graphql-transformer");
    expect(transformer.version).toBe(1);
    expect(transformer.factory).toEqual(expect.any(Function));
  });

  it("delegates to the Nest GraphQL plugin with the expected options", () => {
    const plugin = require("@nestjs/graphql/plugin");
    const expectedTransformer = Symbol("transformer");

    plugin.before.mockReturnValue(expectedTransformer);

    const transformer = require("./graphql-plugin-transformer.cjs");
    const program = Symbol("program");

    const result = transformer.factory({ program });

    expect(plugin.before).toHaveBeenCalledWith(
      {
        typeFileNameSuffix: [
          ".input.ts",
          ".args.ts",
          ".model.ts",
          ".entity.ts",
          ".dto.ts",
          ".payload.ts",
          ".type.ts",
        ],
        introspectComments: true,
      },
      program,
    );
    expect(result).toBe(expectedTransformer);
  });

  it("is registered in the unit Jest ts-jest transformer chain", () => {
    const transformEntry = jestConfig.transform?.["^.+\\.(t|j)s$"];

    expect(transformEntry).toEqual([
      "ts-jest",
      expect.objectContaining({
        astTransformers: {
          before: ["<rootDir>/graphql-plugin-transformer.cjs"],
        },
      }),
    ]);
  });
});

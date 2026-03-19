// @ts-check

const transformer = require("@nestjs/graphql/plugin").default;

/**
 * Nest GraphQL AST transformer configuration reused by ts-jest
 *
 * Keep this file in CommonJS format because it is loaded directly by tooling
 * during compilation/bootstrap, where CommonJS is the most compatible option
 */

module.exports.name = "nestjs-graphql-transformer";
module.exports.version = 1;

/**
 * @param {{ program: import("typescript").Program }} cs
 * @returns {import("typescript").TransformerFactory<import("typescript").SourceFile>}
 */
module.exports.factory = (cs) => {
  return transformer(cs.program, {
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
  });
};

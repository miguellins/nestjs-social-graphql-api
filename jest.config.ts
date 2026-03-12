import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: ".",

  // Unit tests only (keeps e2e separate)
  testMatch: ["**/*.spec.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/", "/test/"],

  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.json",
        astTransformers: {
          before: ["<rootDir>/graphql-plugin-transformer.cjs"],
        },
      },
    ],
  },

  // Your "@/..." alias
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },

  collectCoverageFrom: [
    "src/**/*.service.ts",
    "src/**/*.guard.ts",
    "src/**/*.strategy.ts",
    "src/**/*.filter.ts",
  ],
  coverageDirectory: "coverage",
  testEnvironment: "node",

  // Avoids noisy hangs from open handles (optional)
  // detectOpenHandles: true,
};

export default config;

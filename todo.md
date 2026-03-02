- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE

----------/\

ABOUT TESTS

Here is your scripts section updated with proper Jest test commands for a NestJS + TypeScript project:
"scripts": {
"build": "nest build && tsc-alias",
"format": "prettier --write \"src/**/\*.ts\" \"test/**/\*.ts\"",

"start": "node dist/main",
"start:dev": "nodemon --exec ts-node -r tsconfig-paths/register src/main.ts",
"start:debug": "nest start --debug --watch",

"lint": "eslint \"{src,apps,libs,test}/\*_/_.ts\" --fix",

"test": "jest",
"test:watch": "jest --watch",
"test:cov": "jest --coverage",
"test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
"test:e2e": "jest --config ./test/jest-e2e.json"
}

What Each Test Script Does
test → runs all unit tests once

test:watch → reruns tests automatically on file changes

test:cov → generates coverage report

test:debug → allows debugging tests in VSCode / Chrome DevTools

test:e2e → runs end-to-end tests using a separate config

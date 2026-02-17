TODO List

Top improvement suggestions:

Dependencies with no references outside package.json (string/import/config scan):

@eslint/eslintrc
@nestjs/schematics
@nestjs/testing
source-map-support
ts-loader
supertest
ts-jest
Dependencies with no direct references but often still required by Nest runtime/tooling (review before removing):

@nestjs/platform-express
reflect-metadata
rxjs
Notes:

npm run test currently finds no tests.
npm run test:e2e points to missing jest-e2e.json, so test-related packages are currently unused in practice.

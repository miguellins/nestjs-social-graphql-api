# Request Context Module

The request context module owns per-request correlation state used by GraphQL, bootstrap, and logging code.

## What this module covers

- request id tracking
- request context storage
- request context middleware
- correlation support for logs and GraphQL request handling

## Important behavior

- request context is infrastructure state, not domain state
- clients may provide request ids, but generated ids are used when none are present
- request ids are safe correlation values and must not carry secrets

## Service ownership

- `RequestContextService` owns request-scoped context access.
- `RequestContextMiddleware` owns HTTP request context initialization.

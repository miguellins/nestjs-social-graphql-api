# Logging Module

The logging module provides the shared structured logger used by bootstrap and runtime services.

## What this module covers

- global application logger provider
- request-aware log enrichment
- trace correlation fields when available
- sanitized runtime logging helpers

## Important behavior

- logs should not include secrets, tokens, password hashes, one-time tokens, or raw sensitive payloads
- error logs should preserve useful operational context without leaking internals to GraphQL clients
- request and trace identifiers are correlation aids, not public API fields

## Service ownership

- `AppLoggerService` owns structured application logging behavior.

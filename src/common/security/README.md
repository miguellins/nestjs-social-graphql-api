# Password Security Module

The password security module owns password hashing and verification helpers.

## What this module covers

- bcrypt password hashing
- password verification
- password pepper support
- hash upgrade checks where used by auth flows

## Important behavior

- password constraints must stay compatible with bcrypt
- password hashes and peppers must never be exposed through GraphQL or logs
- account-sensitive flows should avoid leaking whether an account exists

## Service ownership

- `PasswordService` owns password hashing, verification, and password-hash policy helpers.

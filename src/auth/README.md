# Auth Module

The auth module owns authentication, refresh-session lifecycle, logout, password reset, email verification, and user-facing session management.

## What this module covers

- username/password login
- JWT access tokens
- opaque refresh tokens
- refresh-session rotation
- logout by refresh token
- current-session logout
- session inventory
- revoke one session
- revoke all other sessions
- password reset request and completion
- email verification request and completion

## Important behavior

- access tokens carry the authenticated user id, role, and current session id
- refresh tokens are stored hashed in the database
- refresh rotates the token on the same session row
- `mySessions` returns only active sessions
- revoking a session blocks future refresh attempts for that session
- existing short-lived access tokens are not force-revoked; they expire naturally
- session metadata captures user agent and request IP data

## Access model

Public operations:

- `login`
- `requestPasswordReset`
- `resetPassword`
- `verifyEmail`
- `refreshSession`
- `logout`

Authenticated operations:

- `requestEmailVerification`
- `mySessions`
- `logoutCurrentSession`
- `revokeSession`
- `revokeOtherSessions`


## Service ownership

- `AuthService` is the resolver-facing facade and keeps refresh-session rotation and logout close to the session boundary.
- `AuthCredentialService` owns login, password reset request/confirmation, email verification request/confirmation, credential validation, password hash upgrades, and delivery side effects.
- `AuthTokenService` owns access-token signing, opaque token generation, token hashing, token expiry calculation, and active-account authentication gates.
- `AuthSessionService` continues to own session inventory and revocation APIs.

# TO COMPARE BRANCHES IN THE CURSOR:
via the Source Control icon - better
via the GitLens Inspect


# AFTER EVERYTHING IS DONE:
- ADD DOCKER
- ADD GIT LAB
- CREATE AN BIG AND WELL EXPLAINING PROMPT TO CODEX CREATE README.MD FILE - ASKS IF GRAPHQL QUERIES SHOULD BE INSIDE THE FILE
- UPDATE THE .GITIGNORE FILE


//---//---//---// //---//---//---//


# NEXT FEATURE


- implement cursor pagination

- use denormalized post counters consistently

- stop synchronously incrementing views on hot reads



//---//---//---// //---//---//---//


# TO FIX:





# QUESTIONS:







# The Problem:
No password reset



# ABOUT THE NEW IMPLEMENTATION:















//---//---//---// //---//---//---//


# ABOUT THE NEW PASSWORD RESET:
Implemented a production-minded password reset flow that fits the existing auth architecture: public GraphQL mutations, DTO validation at the boundary, Zod parsing in `AuthService`, secure token hashing, generic initiation responses, explicit Prisma modeling, and focused tests.

**Design**
- Request flow uses `email`, not `username`, because reset delivery is inherently an email-channel workflow and the project already stores canonical email addresses.
- Reset tokens are `randomBytes(32)` values encoded as `base64url`; only a SHA-256 hash is stored in the database.
- Tokens are single-use, time-limited, and one-active-token-per-user. A new reset request deletes prior tokens for that user before creating a fresh one. That is the conservative default and keeps the attack surface smaller.
- Password update plus token consumption happens in a transaction.
- I did not implement JWT/session invalidation. The current JWT payload only carries `sub`, so real invalidation would require a broader token-version/session design touching guards and token issuance. That is a larger auth-architecture change than password reset itself.

**Changed Files / Modules**
- `prisma/schema.prisma`
  - Added `User.passwordResetTokens`.
  - Added `PasswordResetToken` with `userId`, `tokenHash`, `expiresAt`, `usedAt`, `createdAt`, unique `tokenHash`, and indexes on `userId` and `expiresAt`.
  - Why: dedicated reset-token storage is the simplest explicit model for this codebase.

- `prisma/migrations/20260321120000_password_reset_tokens/migration.sql`
  - Added the SQL migration creating `PasswordResetToken` and its foreign key to `User`.
  - Why: keeps the schema change reviewable and deployable.

- `src/config/env/env.schema.ts`
  - Added `PASSWORD_RESET_TOKEN_TTL_MINUTES` with default `30`.
  - Why: expiry should be configurable without forcing a new required env var.

- `src/config/env/env.schema.spec.ts`
  - Added coverage for the new TTL default.
  - Why: preserves fail-fast config validation expectations.

- `src/auth/dto/request-password-reset.input.ts`
  - Added GraphQL input for reset initiation with trimmed email validation.
  - Why: keeps GraphQL boundary validation in DTOs.

- `src/auth/dto/reset-password.input.ts`
  - Added GraphQL input for reset completion with token validation and password length constraints matching the existing password rules.
  - Why: keeps reset-password validation consistent with user creation/update.

- `src/auth/schemas/password-reset-command.schema.ts`
  - Added Zod schemas for reset initiation and reset completion.
  - Why: auth already uses service-layer Zod parsing, so password reset follows the same module pattern.

- `src/auth/password-reset-delivery.service.ts`
  - Added a minimal auth-scoped delivery seam.
  - Current behavior: logs a generic warning that delivery is not configured, without logging the token.
  - Why: future-ready for real email integration without inventing a mail subsystem now.

- `src/auth/auth.module.ts`
  - Registered `PasswordResetDeliveryService`.
  - Why: keeps delivery wiring local to the auth module.

- `src/auth/auth.resolver.ts`
  - Added public, throttled mutations:
  - `requestPasswordReset(input)`
  - `resetPassword(input)`
  - Both return `DeleteResponse`.
  - Why: thin resolver, reuse existing response type, preserve current auth style.

- `src/auth/auth.service.ts`
  - Added `requestPasswordReset(...)`.
  - Behavior: normalize email, always return the same generic message, find user by email, delete previous tokens for that user, create a new hashed token with expiry, then attempt best-effort delivery.
  - Added `resetPassword(...)`.
  - Behavior: validate token state, reject invalid/expired/used tokens, hash the new password with `PasswordService`, mark token used, update the password, and delete sibling reset tokens in one transaction.
  - Added token helper methods for generation and hashing.
  - Why: keeps all domain logic, validation parsing, token lifecycle, and Prisma interaction in the service.

- `src/auth/auth.service.spec.ts`
  - Expanded tests for:
  - generic initiation response
  - no enumeration behavior
  - token creation for existing users
  - invalid token
  - expired token
  - reused token
  - successful password reset
  - sibling-token invalidation
  - password actually changes and the old password no longer works
  - Why: covers the critical security-sensitive paths you requested.

- `src/schema.gql`
  - Regenerated via build to include `requestPasswordReset` and `resetPassword` plus the new input types.
  - Why: generated output only, not manually edited.

**Verification**
- `npx prisma generate`
- `npm test -- src/auth/auth.service.spec.ts src/config/env/env.schema.spec.ts`
- `./node_modules/.bin/eslint ...changed auth/env files`
- `npm run build`

**Intentionally Not Changed**
- Login flow still authenticates by `username`.
- No JWT/session invalidation or token-versioning was added.
- No email provider, template system, or frontend URL/base-link generation was added.
- No scheduled cleanup job for expired reset tokens was added.

**Follow-up Tasks For Real Email Integration**
- Implement a real mail provider behind `PasswordResetDeliveryService`.
- Add a reset-link base URL/config once the client route is defined.
- Add email templates and localized copy.
- If you need immediate revocation of existing JWTs after password reset, add a token-version/session model as a separate auth change.
- If reset-token volume grows, add a lightweight cleanup job for expired rows.

### Change Summary

**What changed**
- Added a dedicated password reset token model in `prisma/schema.prisma` and migration `20260321120000_password_reset_tokens`.
- Added new auth inputs in `request-password-reset.input.ts` and `reset-password.input.ts`.
- Added password reset Zod schemas in `password-reset-command.schema.ts`.
- Added `PasswordResetDeliveryService`.
- Updated `auth.module.ts`, `auth.resolver.ts`, and `auth.service.ts` to support `requestPasswordReset` and `resetPassword`.
- Updated `env.schema.ts` and `env.schema.spec.ts` for configurable reset-token TTL.
- Expanded `auth.service.spec.ts`.
- Regenerated `src/schema.gql`.

**Why it changed**
- To add a secure, current-architecture-consistent password reset flow with anti-enumeration behavior, hashed token storage, expiry, single-use semantics, and focused test coverage.

**How it works now**
- `requestPasswordReset` always returns the same generic success-style message.
- For existing accounts, the service deletes prior reset tokens, stores a new hashed token with expiry, and attempts best-effort delivery through `PasswordResetDeliveryService`.
- `resetPassword` validates token existence, expiry, and single-use state, hashes the new password using the existing `PasswordService`, updates the user password, marks the token used, and invalidates sibling tokens transactionally.

**Anything important to review**
- No real email delivery is wired yet; the delivery service is an intentional seam for the next integration step.
- Existing JWTs are not invalidated by password reset in this change.
- `src/schema.gql` changed as generated output from the build.
- There was an unrelated existing modification in `todo.md`; I did not touch it.



## HOW THE RESET PASSWORD WORKS:
`requestPasswordReset` is a public mutation that starts the flow without leaking whether an account exists.

```graphql
mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
  requestPasswordReset(input: $input) {
    message
  }
}
```
Variables:
```json
{
  "input": {
    "email": "user@example.com"
  }
}
```

How it works:
- Validates the GraphQL input email, then normalizes it in `AuthService` with Zod.
- Looks up the user by email.
- If no user exists, it still returns the same generic success message.
- If the user exists, it deletes any previous password reset tokens for that user, generates a new secure random token, stores only its SHA-256 hash in `PasswordResetToken`, sets an expiry, and then calls the delivery service best-effort.
- In `development` and `test`, the delivery service writes the raw reset token to `/tmp/nestjs-graphql-password-reset.json`.
- In `production`, the delivery service does not expose the raw token.
- The raw token is never stored in the database.
- Current response is always:
```json
{
  "data": {
    "requestPasswordReset": {
      "message": "If an account with that email exists, password reset instructions will be sent"
    }
  }
}
```

How to get the token in `development` and `test`:
- Run `requestPasswordReset` with the target email.
- Open the file `/tmp/nestjs-graphql-password-reset.json`.
- Copy the value from the `token` field.
- Use that raw token in `resetPassword`.

Two alternative examples to read the file locally:

SIMPLER:
```bash
cat /tmp/nestjs-graphql-password-reset.json
```

OR

```bash
sed -n '1,120p' /tmp/nestjs-graphql-password-reset.json
```

Example dev/test file contents:
```json
{
  "email": "user@example.com",
  "token": "raw-reset-token",
  "expiresAt": "2026-03-21T12:00:00.000Z"
}
```

`resetPassword` is a public mutation that completes the reset using the token.

```graphql
mutation ResetPassword($input: ResetPasswordInput!) {
  resetPassword(input: $input) {
    message
  }
}
```
Variables:
```json
{
  "input": {
    "token": "raw-reset-token",
    "newPassword": "new-password-123"
  }
}
```

How it works:
- Validates the token and new password at the GraphQL boundary, then normalizes/validates again with Zod in `AuthService`.
- Hashes the provided raw token with SHA-256 and looks up the stored `PasswordResetToken` row by `tokenHash`.
- Rejects the request if the token is missing, expired, or already used.
- Hashes the new password with the existing `PasswordService`.
- In one transaction:
  - marks the matched reset token as used
  - updates the user password
  - deletes any sibling reset tokens for that user
- On success it returns:
```json
{
  "data": {
    "resetPassword": {
      "message": "Password reset successful"
    }
  }
}
```

Important behavior:
- Only one active reset token is kept per user.
- Tokens are single-use.
- Tokens expire.
- Old password stops working after a successful reset.
- Existing JWTs are not invalidated by this change.
- In `development` and `test`, you get the raw token from `/tmp/nestjs-graphql-password-reset.json`, not from logs, not from Prisma, and not from your JWT.



//---//---//---// //---//---//---//

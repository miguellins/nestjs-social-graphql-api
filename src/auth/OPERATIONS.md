# Auth Operations

This document explains the GraphQL operations currently exposed by the `auth` module.

## Public mutations

### `login`
```graphql
mutation Login($input: LoginInput!) {
  login(input: $input) {
    access_token
    refreshToken
  }
}
```

```json
{
  "input": {
    "username": "miguellins",
    "password": "password123"
  }
}
```

### `requestPasswordReset`
```graphql
mutation RequestPasswordReset($input: RequestPasswordResetInput!) {
  requestPasswordReset(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "email": "user@example.com"
  }
}
```

### `resetPassword`
```graphql
mutation ResetPassword($input: ResetPasswordInput!) {
  resetPassword(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "token": "reset-token",
    "newPassword": "new-password-123"
  }
}
```

### `verifyEmail`
```graphql
mutation VerifyEmail($input: VerifyEmailInput!) {
  verifyEmail(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "token": "verification-token"
  }
}
```

### `refreshSession`
```graphql
mutation RefreshSession($input: RefreshSessionInput!) {
  refreshSession(input: $input) {
    access_token
    refreshToken
  }
}
```

```json
{
  "input": {
    "refreshToken": "raw-refresh-token"
  }
}
```

### `logout`
```graphql
mutation Logout($input: LogoutInput!) {
  logout(input: $input) {
    message
  }
}
```

```json
{
  "input": {
    "refreshToken": "raw-refresh-token"
  }
}
```

## Authenticated operations

### `requestEmailVerification`
```graphql
mutation RequestEmailVerification {
  requestEmailVerification {
    message
  }
}
```

```json
{}
```

### `mySessions`
```graphql
query MySessions {
  mySessions {
    id
    createdAt
    lastUsedAt
    expiresAt
    userAgent
    isCurrent
  }
}
```

```json
{}
```

### `logoutCurrentSession`
```graphql
mutation LogoutCurrentSession {
  logoutCurrentSession {
    message
  }
}
```

```json
{}
```

### `revokeSession`
```graphql
mutation RevokeSession($sessionId: Int!) {
  revokeSession(sessionId: $sessionId) {
    message
  }
}
```

```json
{
  "sessionId": 2
}
```

### `revokeOtherSessions`
```graphql
mutation RevokeOtherSessions {
  revokeOtherSessions {
    message
  }
}
```

```json
{}
```

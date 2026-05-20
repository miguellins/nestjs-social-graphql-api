# Users Module
The users module owns public user reads, signup, self-service profile updates, privacy/account-state reads, account deletion, and moderator account-state actions.

## What this module covers
- public user listing
- public user reads by id and username
- authenticated owner profile reads through `myProfile`
- signup
- update the current user's safe profile fields
- update public profile text fields through `updateMyProfile`
- read and update the current user's privacy setting
- delete the current user's account
- moderator suspension and reactivation

## Important behavior
- public reads return safe user projections only
- public profile reads include nullable `bio`, `websiteUrl`, `location`, and
  `avatarUrl`
- `users` list items use the slim preview shape with `avatarUrl` but without
  profile text fields
- `myProfile` exposes pending avatar state to the owner and never exposes email
- `updateMe` remains limited to name, email, username, and password; profile
  text belongs to `updateMyProfile`
- public profile detail reads apply viewer-aware block, private-account,
  suspended, and deactivated visibility rules
- privacy and account-state are modeled explicitly
- `myPrivacySettings` returns both `privacySetting`, `accountState`, and a result message
- user reads are cache-backed with viewer rules applied after the base user cache
- moderator account-state changes are separate from self-service flows


## Service ownership

- `UsersService` is the resolver-facing facade for list reads, profile read delegation, privacy setting reads/updates, and write/account-state delegation.
- `UserProfileReadService` owns viewer-aware profile reads, owner profile reads, safe-user shaping, and public list query projection.
- `UserWriteService` owns user creation, account field updates, public profile updates, password hashing, unique-conflict mapping, and profile cache refresh.
- `UserAccountStateService` owns user deletion, suspension, reactivation, moderation role checks, session revocation during suspension, moderation action persistence, and visibility cache invalidation.
- `UserCacheService` remains the cache-key and safe-user cache helper boundary.

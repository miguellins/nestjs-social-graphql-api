# Users Module
The users module owns public user reads, signup, self-service profile updates, privacy/account-state reads, account deletion, and moderator account-state actions.

## What this module covers
- public user listing
- public user reads by id and username
- signup
- update the current user's safe profile fields
- read and update the current user's privacy setting
- delete the current user's account
- moderator suspension and reactivation

## Important behavior
- public reads return safe user projections only
- privacy and account-state are modeled explicitly
- `myPrivacySettings` returns both `privacySetting`, `accountState`, and a result message
- user reads are cache-backed
- moderator account-state changes are separate from self-service flows

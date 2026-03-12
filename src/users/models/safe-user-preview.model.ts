import { ObjectType, PickType } from "@nestjs/graphql";

import { SafeUser } from "@/users/models/safe-user.model";

/**
 * Small public-safe user shape for nested objects
 *
 * What it does:
 * - exposes only the minimal user fields needed in lists and nested relations
 * - avoids overfetching data in nested GraphQL objects
 * - prevents schema mismatch when only a subset of user fields is selected
 */

/** Minimal public-safe representation of a User for nested fields. */
@ObjectType()
export class SafeUserPreview extends PickType(SafeUser, [
  "id",
  "name",
  "username",
] as const) {}

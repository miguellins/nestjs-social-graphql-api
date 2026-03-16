import { ObjectType, PickType } from "@nestjs/graphql";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";
import { SafeUser } from "@/users/models/safe-user.model";

/**
 * GraphQL model for user previews
 *
 * Exposes a minimal public user shape for nested fields
 */

/** Minimal public user representation for nested fields */
@ObjectType({ implements: () => PublicUserIdentity })
export class SafeUserPreview extends PickType(SafeUser, [
  "id",
  "name",
  "username",
] as const) {}

import { ObjectType, PickType } from "@nestjs/graphql";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";
import { SafeUser } from "@/users/models/safe-user.model";

/**
 * Lightweight public-safe representation of a notification actor
 *
 * What it does:
 * - Exposes only minimal actor data required by notification UIs
 * - Prevents sensitive user fields from being returned in nested objects
 * - Keeps notification payloads small and predictable
 */

/** Minimal safe representation of the actor who triggered a notification. */
@ObjectType({ implements: () => PublicUserIdentity })
export class NotificationActorDTO extends PickType(SafeUser, [
  "id",
  "username",
  "name",
] as const) {}

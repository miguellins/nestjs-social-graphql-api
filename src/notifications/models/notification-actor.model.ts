import { ObjectType, PickType } from "@nestjs/graphql";

import { PublicUserIdentity } from "@/users/models/public-user-identity.interface";
import { SafeUser } from "@/users/models/safe-user.model";

/**
 * GraphQL model for notification actors
 *
 * Exposes the public actor fields shown in notifications
 */

/** Minimal safe representation of the actor who triggered a notification. */
@ObjectType({ implements: () => PublicUserIdentity })
export class NotificationActorDTO extends PickType(SafeUser, [
  "id",
  "username",
  "name",
] as const) {}

import { Field, Int, ObjectType } from "@nestjs/graphql";

import { SafeUser } from "@/users/models/safe-user.model";

/** Represents one per-actor notification silence preference. */
@ObjectType()
export class SilencedActorEdge {
  /** Unique identifier of the actor preference row. */
  @Field(() => Int)
  id!: number;

  /** Recipient user id that owns this preference. */
  @Field(() => Int)
  userId!: number;

  /** Actor user id whose notifications are silenced. */
  @Field(() => Int)
  actorId!: number;

  /** Whether notifications from this actor are enabled. */
  @Field(() => Boolean)
  notificationsEnabled!: boolean;

  /** Safe public profile for the silenced actor. */
  @Field(() => SafeUser, { nullable: true })
  actor?: SafeUser;

  /** When this actor preference was created. */
  @Field(() => Date)
  createdAt!: Date;
}

import { Field, Int, ObjectType } from "@nestjs/graphql";

import { MuteScope } from "@/mutes/enums/mute-scope.enum";
import { SafeUser } from "@/users/models/safe-user.model";

/** Represents one directional mute relationship edge. */
@ObjectType()
export class MuteEdgeDTO {
  /** Unique identifier of the mute edge. */
  @Field(() => Int)
  id!: number;

  /** User id of the muter (the viewer who muted someone). */
  @Field(() => Int)
  muterId!: number;

  /** User id of the muted user. */
  @Field(() => Int)
  mutedUserId!: number;

  /** Surfaces where this mute is active. */
  @Field(() => [MuteScope])
  scopes!: MuteScope[];

  /** Safe public profile for the muted user when the edge is returned in lists. */
  @Field(() => SafeUser, { nullable: true })
  mutedUser?: SafeUser;

  /** When this mute edge was created. */
  @Field(() => Date)
  createdAt!: Date;
}

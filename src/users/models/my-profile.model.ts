import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { MediaStatus } from "@/media/models/media.enums";
import { SafeUser } from "@/users/models/safe-user.model";

/** Owner-only profile avatar upload state for pending replacements. */
@ObjectType()
export class PendingProfileAvatar {
  /** Identifier of the pending avatar media record. */
  @Field(() => ID)
  id: number;

  /** Upload lifecycle state for the pending avatar. */
  @Field(() => MediaStatus)
  status: MediaStatus;

  /** Public delivery URL expected after the pending avatar is uploaded. */
  @Field()
  avatarUrl: string;

  /** Timestamp indicating when the pending avatar upload was requested. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;
}

/** Authenticated owner profile view with private upload state but no email. */
@ObjectType()
export class MyProfile extends SafeUser {
  /** Latest pending avatar upload visible only to the owning user. */
  @Field(() => PendingProfileAvatar, {
    nullable: true,
  })
  pendingAvatar?: PendingProfileAvatar | null;
}

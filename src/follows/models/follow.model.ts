import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Core representation of a Follow relationship between two users. */
@ObjectType()
export class Follow {
  /** Unique identifier of the follow relationship record. */
  @Field(() => ID)
  id: number;

  /** Timestamp indicating when the follow relationship was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the follow relationship was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Identifier of the user who initiated the follow action (the follower). */
  @Field(() => Int)
  followerId: number;

  /** Identifier of the user being followed (the following). */
  @Field(() => Int)
  followingId: number;

  /** Optional lightweight preview of the follower user. */
  @Field(() => SafeUserPreview, {
    nullable: true,
  })
  follower?: SafeUserPreview;

  /** Optional lightweight preview of the followed user. */
  @Field(() => SafeUserPreview, {
    nullable: true,
  })
  following?: SafeUserPreview;
}

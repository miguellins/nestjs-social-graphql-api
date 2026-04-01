import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Lightweight representation of a Like, containing minimal metadata and a safe preview of the user who performed the like. */
@ObjectType()
export class LikePreview {
  /** Unique identifier of the like record. Used internally for referencing and pagination. */
  @Field(() => ID)
  id: number;

  /** Timestamp indicating when the like was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the like was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Public safe preview of the user who performed the like. */
  @Field(() => SafeUserPreview)
  user: SafeUserPreview;
}

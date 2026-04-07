import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Public post payload returned immediately after successful post creation. */
@ObjectType()
export class CreatedPost {
  /** Unique identifier of the post. */
  @Field(() => ID)
  id: number;

  /** Title of the post. */
  @Field({ nullable: true })
  title: string | null;

  /** Main textual content of the post. */
  content: string;

  /** Timestamp indicating when the post was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the post was originally created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;
}

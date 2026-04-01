import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Core public representation of a Post entity. */
@ObjectType()
export class Post {
  /** Unique identifier of the post. Used for referencing, routing, and relation mapping. */
  @Field(() => ID)
  id: number;

  /** Title of the post. */
  @Field({ nullable: true })
  title: string | null;

  /** Main textual content of the post. */
  @Field()
  content: string;

  /** Timestamp indicating when the post was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the post was originally created.",
  })
  createdAtFormatted?: string;

  /** Total number of likes associated with the post. */
  @Field(() => Int)
  likesCount: number;

  /** Total number of comments associated with the post. */
  @Field(() => Int)
  commentsCount: number;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;
}

import { Field, ID, Int, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/**
 * GraphQL model for public comments
 *
 * Exposes the safe comment fields returned by the API
 */

@ObjectType()
export class SafeCommentDTO {
  /** Unique identifier of the comment. */
  @Field(() => ID)
  id: number;

  /** Comment content visible to clients. */
  content: string;

  /** Timestamp indicating when the comment was created. */
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the comment was created.",
  })
  createdAtFormatted?: string;

  /** Timestamp indicating the latest update made to the comment. */
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("updatedAt", {
    description:
      "Presentation-friendly UTC timestamp for when the comment was last updated.",
  })
  updatedAtFormatted?: string;

  /** Identifier of the user who authored the comment. */
  @Field(() => Int)
  authorId: number;

  /** Identifier of the post that owns the comment. */
  @Field(() => Int)
  postId: number;

  /** Public-safe preview of the comment author. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;
}

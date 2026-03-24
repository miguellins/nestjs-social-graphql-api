import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";
import { SafeCommentDTO } from "@/comments/models/safe-comment.model";
import { LikePreview } from "@/posts/models/like-preview.model";

/**
 * GraphQL model for post details
 *
 * Exposes the detailed post view returned by the API
 */

/** Comprehensive representation of a Post entity intended for detailed views. */
@ObjectType()
export class PostDetail {
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

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("createdAt", {
    description:
      "Presentation-friendly UTC timestamp for when the post was originally created.",
  })
  createdAtFormatted?: string;

  /** Timestamp indicating the last time the post was updated. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("updatedAt", {
    description:
      "Presentation-friendly UTC timestamp for when the post was last updated.",
  })
  updatedAtFormatted?: string;

  /** Timestamp indicating when the post body or title was last meaningfully edited. */
  @Field(() => GraphQLISODateTime, {
    nullable: true,
  })
  editedAt: Date | null;

  /** Presentation-friendly UTC timestamp for UI display. */
  @FormattedDateTimeField("editedAt", {
    description:
      "Presentation-friendly UTC timestamp for when the post body or title was last meaningfully edited.",
  })
  editedAtFormatted?: string;

  /** Total number of likes associated with the post. */
  @Field(() => Int)
  likesCount: number;

  /** Total number of comments associated with the post. */
  @Field(() => Int)
  commentsCount: number;

  /** Total number of times the post detail view has been accessed successfully. */
  @Field(() => Int)
  viewsCount: number;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Optional lightweight list of likes associated with the post. */
  @Field(() => [LikePreview], {
    nullable: true,
  })
  likes?: LikePreview[];

  /** Optional lightweight list of comments associated with the post. */
  @Field(() => [SafeCommentDTO], {
    nullable: true,
  })
  comments?: SafeCommentDTO[];
}

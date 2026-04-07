import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";
import { PostMedia } from "@/media/models/post-media.model";

/** Post payload returned after a media attachment mutation succeeds. */
@ObjectType()
export class AttachMediaPostResult {
  /** Unique identifier of the post. Used for referencing, routing, and relation mapping. */
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

  /** Timestamp indicating the last time the post was updated. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for when the post was last updated. */
  @FormattedDateTimeField("updatedAt")
  updatedAtFormatted?: string;

  /** Timestamp indicating when the post body or title was last meaningfully edited. */
  @Field(() => GraphQLISODateTime, {
    nullable: true,
  })
  editedAt: Date | null;

  /** Presentation-friendly UTC timestamp for when the post body or title was last meaningfully edited. */
  @FormattedDateTimeField("editedAt")
  editedAtFormatted?: string;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Total number of likes associated with the post. */
  @Field(() => Int)
  likesCount: number;

  /** Total number of comments associated with the post. */
  @Field(() => Int)
  commentsCount: number;

  /** Total number of times the post detail view has been accessed successfully. */
  @Field(() => Int)
  viewsCount: number;

  /** Optional ordered list of media attachments associated with the post. */
  @Field(() => [PostMedia], {
    nullable: true,
  })
  mediaAttachments?: PostMedia[];
}

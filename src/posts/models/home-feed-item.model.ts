import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { PostMedia } from "@/media/models/post-media.model";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Home-screen optimized post representation for the authenticated user's feed. */
@ObjectType()
export class HomeFeedItem {
  /** Unique identifier of the feed item post. */
  @Field(() => ID)
  id: number;

  /** Optional headline attached to the post. */
  @Field({ nullable: true })
  title: string | null;

  /** Main textual content shown in the feed card. */
  @Field()
  content: string;

  /** Timestamp indicating when the post was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the post was originally created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Total number of likes associated with the post. */
  @Field(() => Int)
  likesCount: number;

  /** Total number of comments associated with the post. */
  @Field(() => Int)
  commentsCount: number;

  /** Indicates whether the current viewer has liked the post. */
  @Field(() => Boolean)
  viewerHasLiked: boolean;

  /** Indicates whether the current viewer has bookmarked the post. */
  @Field(() => Boolean)
  viewerHasBookmarked: boolean;

  /** Safe public preview of the post author. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Optional ordered list of media attachments associated with the post. */
  @Field(() => [PostMedia], {
    nullable: true,
  })
  mediaAttachments?: PostMedia[];
}

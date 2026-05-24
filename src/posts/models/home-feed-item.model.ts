import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { PostKind } from "@/posts/enums/post-kind.enum";
import { SafePostEmbed } from "@/posts/models/safe-post-embed.model";

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

  /** Feed item post composition kind. */
  @Field(() => PostKind)
  kind: PostKind;

  /** Root source post id for repost and quote feed items. */
  @Field(() => ID, { nullable: true })
  sourcePostId: number | null;

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

  /** Repost count for original posts; null for repost and quote wrappers. */
  @Field(() => Int, { nullable: true })
  repostsCount: number | null;

  /** Indicates whether the current viewer has reposted this post or root source. */
  @Field(() => Boolean)
  viewerHasReposted: boolean;

  /** Indicates whether the current viewer has bookmarked the post. */
  @Field(() => Boolean)
  viewerHasBookmarked: boolean;

  /** Embedded source preview for repost and quote feed items. */
  @Field(() => SafePostEmbed, { nullable: true })
  sourcePost?: SafePostEmbed | null;

  /** Safe public preview of the post author. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Optional ordered list of media attachments associated with the post. */
  @Field(() => [PostMedia], {
    nullable: true,
  })
  mediaAttachments?: PostMedia[];
}

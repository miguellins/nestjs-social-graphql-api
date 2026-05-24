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

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";
import { LikePreview } from "@/posts/models/like-preview.model";
import { PostMedia } from "@/media/models/post-media.model";
import { Comment } from "@/comments/models/comment.model";

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

  /** Post composition kind used by clients to render original, repost, and quote cards. */
  @Field(() => PostKind)
  kind: PostKind;

  /** Root source post id for repost and quote derivatives. */
  @Field(() => ID, { nullable: true })
  sourcePostId: number | null;

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

  /** Total number of likes associated with the post. */
  @Field(() => Int)
  likesCount: number;

  /** Total number of comments associated with the post. */
  @Field(() => Int)
  commentsCount: number;

  /** Repost count for original posts; null for repost and quote wrappers. */
  @Field(() => Int, { nullable: true })
  repostsCount: number | null;

  /** Indicates whether the current viewer has reposted this post or root source. */
  @Field(() => Boolean)
  viewerHasReposted: boolean;

  /** Embedded source preview for repost and quote wrappers. */
  @Field(() => SafePostEmbed, { nullable: true })
  sourcePost?: SafePostEmbed | null;

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
  @Field(() => [Comment], {
    nullable: true,
  })
  comments?: Comment[];

  /** Optional ordered list of media attachments associated with the post. */
  @Field(() => [PostMedia], {
    nullable: true,
  })
  mediaAttachments?: PostMedia[];
}

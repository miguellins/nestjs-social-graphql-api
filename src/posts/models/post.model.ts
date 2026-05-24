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

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;
}

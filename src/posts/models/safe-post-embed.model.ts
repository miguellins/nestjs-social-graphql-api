import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { PostKind } from "@/posts/enums/post-kind.enum";

import { PostMedia } from "@/media/models/post-media.model";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Embedded source-post preview shown inside repost and quote post cards. */
@ObjectType()
export class SafePostEmbed {
  /** Source post id when available to the viewer. */
  @Field(() => ID, { nullable: true })
  id: number | null;

  /** Source post title when available to the viewer. */
  @Field({ nullable: true })
  title: string | null;

  /** Source post content when available to the viewer. */
  @Field({ nullable: true })
  content: string | null;

  /** Source post kind when available to the viewer. */
  @Field(() => PostKind, { nullable: true })
  kind: PostKind | null;

  /** Source post creation timestamp when available to the viewer. */
  @Field(() => GraphQLISODateTime, { nullable: true })
  createdAt: Date | null;

  /** Presentation-friendly UTC timestamp for the embedded source creation time. */
  @FormattedDateTimeField("createdAt", { nullable: true })
  createdAtFormatted?: string | null;

  /** Source post like count when available to the viewer. */
  @Field(() => Int, { nullable: true })
  likesCount: number | null;

  /** Source post comment count when available to the viewer. */
  @Field(() => Int, { nullable: true })
  commentsCount: number | null;

  /** Source post repost count when available to the viewer. */
  @Field(() => Int, { nullable: true })
  repostsCount: number | null;

  /** Indicates the source exists but is unavailable to this viewer or read surface. */
  @Field(() => Boolean)
  isUnavailable: boolean;

  /** Safe public preview of the embedded source author. */
  @Field(() => SafeUserPreview, { nullable: true })
  author: SafeUserPreview | null;

  /** Optional ordered source media attachments. */
  @Field(() => [PostMedia], { nullable: true })
  mediaAttachments?: PostMedia[];
}

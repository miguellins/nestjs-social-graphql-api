import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafePostEmbed } from "@/posts/models/safe-post-embed.model";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Lightweight repost list item showing the repost wrapper, actor, and source preview. */
@ObjectType()
export class RepostListItem {
  /** Repost wrapper post id. */
  @Field(() => ID)
  id: number;

  /** Root source post id that was reposted. */
  @Field(() => ID)
  sourcePostId: number;

  /** Timestamp when the repost wrapper was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the repost was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Public safe preview of the reposting user. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Embedded source post preview. */
  @Field(() => SafePostEmbed)
  sourcePost: SafePostEmbed;
}

import { Field, ID, Int, ObjectType } from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/** Public-safe direct reply representation exposed under one top-level comment. */
@ObjectType()
export class CommentReply {
  /** Unique identifier of the reply. */
  @Field(() => ID)
  id: number;

  /** Reply content visible to clients. */
  @Field()
  content: string;

  /** Timestamp indicating when the reply was created. */
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the reply was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Timestamp indicating the latest update made to the reply. */
  updatedAt: Date;

  /** Presentation-friendly UTC timestamp for when the reply was last updated. */
  @FormattedDateTimeField("updatedAt")
  updatedAtFormatted?: string;

  /** Identifier of the user who authored the reply. */
  @Field(() => Int)
  authorId: number;

  /** Identifier of the post that owns the reply. */
  @Field(() => Int)
  postId: number;

  /** Parent top-level comment identifier for this direct reply. */
  @Field(() => Int, { nullable: true })
  parentCommentId: number | null;

  /** Public-safe preview of the reply author. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;
}

import { Field, ID, Int, ObjectType } from "@nestjs/graphql";

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

  /** Timestamp indicating the latest update made to the comment. */
  updatedAt: Date;

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

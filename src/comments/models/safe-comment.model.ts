import { Field, ID, Int, ObjectType } from "@nestjs/graphql";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

/**
 * Public-safe GraphQL model returned for comment queries and mutations
 *
 * What it does:
 * - exposes only comment fields that are safe for API clients
 * - includes a lightweight author preview for nested rendering
 * - defines the GraphQL output contract independently from Prisma select logic
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

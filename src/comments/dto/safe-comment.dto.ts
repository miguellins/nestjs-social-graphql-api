import { Field, Int, ObjectType } from "@nestjs/graphql";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

import { Prisma } from "@prisma/client";

/**
 * Safe GraphQL DTO returned when a comment is queried or created
 *
 * What it does:
 * - exposes only safe comment fields to the client
 * - includes basic author information
 * - is used by resolvers as the return type
 */

@ObjectType()
export class SafeCommentDTO {
  /** Unique identifier of the comment. */
  @Field(() => Int)
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

/**
 * Safe Prisma select used to return only the comment fields
 * that are allowed to be exposed by the API
 */

export const SafeCommentSelect = {
  id: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  authorId: true,
  postId: true,
  author: {
    select: {
      id: true,
      name: true,
      username: true,
    },
  },
} as const satisfies Prisma.CommentSelect;

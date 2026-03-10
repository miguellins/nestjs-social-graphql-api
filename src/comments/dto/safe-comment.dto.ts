import { Field, Int, ObjectType } from "@nestjs/graphql";

import { SafeUserPreview } from "@/posts/models/safe-user-preview.model";

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
  @Field(() => Int)
  id: number;

  @Field()
  content: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => Int)
  authorId: number;

  @Field(() => Int)
  postId: number;

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

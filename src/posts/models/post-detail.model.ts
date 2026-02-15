import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { SafeUserPreview } from "./safe-user-preview.model";
import { LikePreview } from "./like-preview.model";
import { PostCounts } from "./post-counts.model";

/**
 * Detailed GraphQL Object Type representing a single Post.
 *
 * What it does:
 * - Provides a rich, client-ready representation of a post
 * - Includes relational previews while avoiding heavy nested objects
 * - Maintains a safe API contract by exposing only non-sensitive data
 *
 * When to use:
 * This type should be returned ONLY for single-resource queries, such as 'postById'
 *
 * Design philosophy:
 * LIST - lightweight, fast, scalable
 * DETAIL - richer, but still optimized
 *
 * Performance strategy:
 * Even though this is a "detail" object, relations are still previews
 * Avoid returning full relational trees
 *
 * Security benefit:
 * Uses SafeUserPreview instead of the full User model to prevent accidental exposure
 * of private user data
 */

@ObjectType()
export class PostDetail {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  @Field(() => PostCounts)
  _count: PostCounts;

  @Field(() => [LikePreview], { nullable: true })
  likes?: LikePreview[];
}

import {
  Field,
  ID,
  ObjectType,
  GraphQLISODateTime,
  Int,
} from "@nestjs/graphql";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";
import { LikePreview } from "@/posts/models/like-preview.model";
import { PostCounts } from "@/posts/models/post-counts.model";
import { SafeCommentDTO } from "@/comments/models/safe-comment.model";

/**
 * Detailed GraphQL Object Type representing a single Post
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

/** Comprehensive representation of a Post entity intended for detailed views. */
@ObjectType()
export class PostDetail {
  /** Unique identifier of the post. Used for referencing, routing, and relation mapping. */
  @Field(() => ID)
  id: number;

  /** Title of the post. */
  title: string;

  /** Main textual content of the post. */
  content: string;

  /** Timestamp indicating when the post was originally created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Timestamp indicating the last time the post was updated. */
  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  /** Total number of times the post detail view has been accessed successfully. */
  @Field(() => Int)
  viewsCount: number;

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Aggregated metadata related to the post. */
  @Field(() => PostCounts)
  _count: PostCounts;

  /** Optional lightweight list of likes associated with the post. */
  @Field(() => [LikePreview], {
    nullable: true,
  })
  likes?: LikePreview[];

  /** Optional lightweight list of comments associated with the post. */
  @Field(() => [SafeCommentDTO], {
    nullable: true,
  })
  comments?: SafeCommentDTO[];
}

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

@ObjectType({
  description:
    "Comprehensive representation of a Post entity intended for detailed views",
})
export class PostDetail {
  @Field(() => ID, {
    description:
      "Unique identifier of the post. Used for referencing, routing, and relation mapping",
  })
  id: number;

  @Field({ description: "Title of the post" })
  title: string;

  @Field({ description: "Main textual content of the post" })
  content: string;

  @Field(() => GraphQLISODateTime, {
    description: "Timestamp indicating when the post was originally created",
  })
  createdAt: Date;

  @Field(() => GraphQLISODateTime, {
    description: "Timestamp indicating the last time the post was updated",
  })
  updatedAt: Date;

  @Field(() => SafeUserPreview, {
    description: "Public safe preview of the user who authored the post",
  })
  author: SafeUserPreview;

  @Field(() => PostCounts, {
    description: "Aggregated metadata related to the post",
  })
  _count: PostCounts;

  @Field(() => [LikePreview], {
    nullable: true,
    description: "Optional lightweight list of likes associated with the post",
  })
  likes?: LikePreview[];
}

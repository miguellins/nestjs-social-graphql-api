import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { SafeUserPreview } from "./safe-user-preview.model";
import { PostCounts } from "./post-counts.model";

/**
 * Lightweight GraphQL Object Type representing a Post in list-based queries
 *
 * What it does:
 * - Provides only the data necessary for feeds and collections
 * - Keeps responses small to improve API performance
 * - Avoids expensive nested relationships
 * - Establishes a predictable structure for UI rendering
 *
 * Design philosophy:
 * LIST objects should always be optimized for speed
 * The goal is to return the minimum viable data needed to render the UI
 *
 * Performance benefit:
 * Returning lighter objects:
 * - reduces database load
 * - lowers network latency
 * - improves client rendering time
 * - helps your API scale under heavy traffic
 *
 * Security benefit:
 * Uses SafeUserPreview to prevent leaking sensitive user information.
 *
 * Important:
 * Never add large relational arrays (likes, comments) to list objects
 */

@ObjectType({
  description:
    "Lightweight representation of a Post entity optimized for List views",
})
export class PostListItem {
  @Field(() => ID, {
    description:
      "Unique identifier of the post. Used for routing, referencing, and pagination cursors",
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

  @Field(() => SafeUserPreview, {
    description: "Public safe preview of the user who authored the post",
  })
  author: SafeUserPreview;

  @Field(() => PostCounts, {
    description: "Aggregated metadata related to the post",
  })
  _count: PostCounts;
}

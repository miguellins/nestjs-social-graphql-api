import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";
import { PostCounts } from "@/posts/models/post-counts.model";

/**
 * Core GraphQL Object Type representing a Post
 *
 * What it does:
 * - Defines the base shape of a post returned by the API
 * - Exposes only safe, client-ready data
 * - Keeps relational depth shallow for better performance
 * - Acts as a reusable foundation across queries and mutations
 *
 * Architecture note:
 * Think of this as the shared public post shape used by list queries,
 * nested relations, and write operations, while PostDetail remains the
 * richer single-resource view.
 *
 * This layered approach is very common in production systems because it allows you
 * to scale without rewriting your schema
 *
 * Security benefit:
 * Uses SafeUserPreview to avoid exposing sensitive user fields such as email,
 * password, tokens, etc
 *
 * Performance strategy:
 * Includes aggregated counts instead of full relational arrays
 */

/** Core public representation of a Post entity. */
@ObjectType()
export class Post {
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

  /** Public safe preview of the user who authored the post. */
  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  /** Aggregated metadata related to the post. */
  @Field(() => PostCounts)
  _count: PostCounts;
}

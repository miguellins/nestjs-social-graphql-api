import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { SafeUserPreview } from "@/posts/models/safe-user-preview.model";
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
 * Think of this as the "middle-weight" object:
 * PostListItem - ultra lightweight (feeds)
 * Post - balanced (most operations)
 * PostDetail - rich (single-resource views)
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

@ObjectType({ description: "Core public representation of a Post entity" })
export class Post {
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

  @Field(() => SafeUserPreview, {
    description: "Public safe preview of the user who authored the post",
  })
  author: SafeUserPreview;

  @Field(() => PostCounts, {
    description: "Aggregated metadata related to the post",
  })
  _count: PostCounts;
}

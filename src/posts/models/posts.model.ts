import { Field, GraphQLISODateTime, ID, ObjectType } from "@nestjs/graphql";

import { SafeUserPreview } from "./safe-user-preview.model";
import { PostCounts } from "./post-counts.model";

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

@ObjectType()
export class Post {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => SafeUserPreview)
  author: SafeUserPreview;

  @Field(() => PostCounts)
  _count: PostCounts;
}

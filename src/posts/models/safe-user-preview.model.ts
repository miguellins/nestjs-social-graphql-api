import { Field, ID, ObjectType } from "@nestjs/graphql";

/**
 * Ultra-lightweight public representation of a User
 *
 * What it does:
 * - Exposes only the minimum data required to identify a user
 * - Prevents sensitive fields from ever reaching the client
 * - Optimizes nested GraphQL queries
 * - Reduces payload size in relational responses
 *
 * Design philosophy:
 * Always return the smallest object possible inside relations
 *
 * Why this matters:
 * Deep GraphQL nesting is one of the fastest ways to destroy API performance
 *
 * Example of a dangerous chain: Post - Likes - User - Followers - Posts
 * Preview objects stop that explosion early
 *
 * Security benefit:
 * Guarantees that critical fields are never exposed
 */

@ObjectType()
export class SafeUserPreview {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field()
  username: string;
}

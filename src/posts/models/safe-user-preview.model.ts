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

/** Minimal public safe representation of a User entity intended for relational previews. */
@ObjectType()
export class SafeUserPreview {
  /** Unique identifier of the user. Used for referencing and relational mapping. */
  @Field(() => ID)
  id: number;

  /** Public display name. */
  name: string;

  /** Unique username used for identification. */
  username: string;
}

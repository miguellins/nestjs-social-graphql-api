import { Field, Int, ObjectType } from "@nestjs/graphql";

/**
 * GraphQL Object Type that exposes aggregated relationship metrics for a User
 *
 * What it does:
 * - Returns lightweight numeric summaries instead of full relational data
 * - Prevents expensive nested queries
 * - Improves API performance
 * - Keeps responses predictable and scalable
 *
 * Why this matters:
 * Fetching entire arrays (posts, followers, likes) can become extremely expensive as the
 * application grows
 *
 * Example problem: A user with 50k followers would generate a massive payload
 *
 * Returning counts instead:
 * - Faster queries
 * - Smaller responses
 * - Better mobile performance
 * - Lower database load
 *
 * Architectural benefit:
 * This follows a very common production pattern:
 * "Return metadata first, fetch details only when needed"
 *
 * Clients can decide:
 * - Show the count only
 * - Lazily load the full list later
 *
 * Prisma optimization:
 * These values are typically retrieved using '_count', which is highly efficient at the
 * database level
 *
 * Security benefit:
 * - Avois unintentionally exposing relationship data
 */

/** Aggregated numeric metadata representing user relationships and activity. */
@ObjectType()
export class UserCounts {
  /** Total number of posts created by the user. */
  @Field(() => Int)
  posts: number;

  /** Total number of likes performed by the user across all posts. */
  @Field(() => Int)
  likes: number;

  /** Total number of users following this account. */
  @Field(() => Int)
  followers: number;

  /** Total number of accounts this user is currently following. */
  @Field(() => Int)
  following: number;
}

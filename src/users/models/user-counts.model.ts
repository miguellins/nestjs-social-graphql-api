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

@ObjectType()
export class UserCounts {
  @Field(() => Int)
  posts: number;

  @Field(() => Int)
  likes: number;

  @Field(() => Int)
  followers: number;

  @Field(() => Int)
  following: number;
}

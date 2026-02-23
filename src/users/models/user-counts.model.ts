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

@ObjectType({
  description:
    "Aggregated numeric metadata representing user relationships and activity",
})
export class UserCounts {
  @Field(() => Int, {
    description: "Total number of posts created by the user",
  })
  posts: number;

  @Field(() => Int, {
    description: "Total number of likes performed by the user across all posts",
  })
  likes: number;

  @Field(() => Int, {
    description: "Total number of users following this account",
  })
  followers: number;

  @Field(() => Int, {
    description: "Total number of accounts this user is currently following",
  })
  following: number;
}

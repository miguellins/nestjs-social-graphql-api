import { Field, Int, ObjectType } from "@nestjs/graphql";

/**
 * Aggregated relationship counts for a Post
 *
 * What it does:
 * - Exposes engagement metrics without loading full relational data
 * - Prevents expensive nested queries
 * - Keeps API responses small and fast
 *
 * Why it exists:
 * Counting in the database is significantly cheaper than returning large arrays
 * of related records
 *
 * Example - Instead of returning 5,000 likes - return { likes: 5000 }
 *
 * Design philosophy:
 * Prefer counts for list and detail views
 * Fetch full relations only when truly necessary
 *
 * Performance benefit:
 * - Reduces DB load
 * - Improves response time
 * - Helps APIs scale under heavy traffic
 *
 * Future scalability:
 * This object can grow safely as product evolves
 */

@ObjectType()
export class PostCounts {
  @Field(() => Int)
  likes: number;
}

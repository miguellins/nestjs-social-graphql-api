import { Field, Int, ObjectType } from "@nestjs/graphql";

/**
 * GraphQL model for post counts
 *
 * Exposes aggregate post metrics for API responses
 */

/** Aggregated numeric metadata for a Post entity. Provides lightweight summary information. */
@ObjectType()
export class PostCounts {
  /** Total number of likes associated with this post. */
  @Field(() => Int)
  likes: number;

  /** Total number of comments associated with this post. */
  @Field(() => Int)
  comments: number;
}

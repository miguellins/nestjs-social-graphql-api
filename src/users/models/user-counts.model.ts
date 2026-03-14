import { Field, Int, ObjectType } from "@nestjs/graphql";

/**
 * Aggregated user relationship counts
 */

/** Numeric metadata for user activity and relationships */
@ObjectType()
export class UserCounts {
  /** Total posts created by the user */
  @Field(() => Int)
  posts: number;

  /** Total likes made by the user */
  @Field(() => Int)
  likes: number;

  /** Total followers */
  @Field(() => Int)
  followers: number;

  /** Total accounts this user follows */
  @Field(() => Int)
  following: number;
}

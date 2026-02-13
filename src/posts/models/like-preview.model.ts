import { Field, ID, ObjectType, GraphQLISODateTime } from "@nestjs/graphql";

import { SafeUserPreview } from "./safe-user-preview.model";

/**
 * Lightweight representation of a Like used in relational queries
 *
 * What it does:
 * - Exposes only the essential data needed by the client
 * - Prevents returning the full Like or User models
 * - Keeps nested responses performant and scalable
 *
 * Why it exists:
 * Returning full relational objects inside arrays (likes - users) can quickly create
 * very heavy payloads
 *
 * This preview pattern ensures:
 * - Smaller responses
 * - Faster queries
 * - Better API scalability
 *
 * Design philosophy:
 * Detail objects should still be optimized
 * Even when fetching a single post, nested relations must remain lightweight
 *
 * Security benefit:
 * Uses SafeUserPreview instead of the full User type to avoid leaking sensitive user
 * data such as email or password
 */

@ObjectType()
export class LikePreview {
  @Field(() => ID)
  id: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => SafeUserPreview)
  user: SafeUserPreview;
}

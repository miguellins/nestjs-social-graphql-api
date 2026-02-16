import {
  Field,
  ID,
  Int,
  ObjectType,
  GraphQLISODateTime,
} from "@nestjs/graphql";

import { User } from "src/users/models/users.model";

/**
 * Full Like GraphQL ObjectType
 *
 * What it represents:
 * - A direct mapping of the Like database entity
 * - Exposes relational structure between User and Post
 *
 * Important:
 * This is a "raw entity shape"
 * It is heavier and more sensitive than LikeListItem
 *
 * What it does:
 * - Exposes relational data (user)
 * - Keeps foreign keys visible (userId, postId)
 * - Suitable for internal or admin-level queries
 *
 * Security considerations:
 * - Uses full User object (NOT SafeUserPreview)
 * - Can expose more user data depending on User model design
 * - Should NOT be used in public list endpoints
 */

@ObjectType()
export class Like {
  @Field(() => ID)
  id: number;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => Int, { nullable: true })
  userId: number;

  @Field(() => User, { nullable: true })
  user?: User;

  @Field(() => Int)
  postId: number;
}

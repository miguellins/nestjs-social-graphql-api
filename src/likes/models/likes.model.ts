import {
  Field,
  ID,
  Int,
  ObjectType,
  GraphQLISODateTime,
} from "@nestjs/graphql";

import { User } from "@/users/models/users.model";

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

@ObjectType({
  description:
    "Core representation of a Like entity. Connects a user to a post and exposes minimal relational data",
})
export class Like {
  @Field(() => ID, {
    description:
      "Unique identifier of the like record. Used for referencing and relational mapping",
  })
  id: number;

  @Field(() => GraphQLISODateTime, {
    description: "Timestamp indicating when the like was created",
  })
  createdAt: Date;

  @Field(() => Int, {
    nullable: true,
    description: "Identifier of the user who performed the like",
  })
  userId: number;

  @Field(() => User, {
    nullable: true,
    description: "Optional full user object associated with this like",
  })
  user?: User;

  @Field(() => Int, {
    description: "Identifier of the post that was liked",
  })
  postId: number;
}

import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { User } from "@/users/models/users.model";

/**
 * GraphQL model for likes
 *
 * Exposes the public like fields returned by the API
 */

/** Core representation of a Like entity. Connects a user to a post and exposes minimal relational data. */
@ObjectType()
export class Like {
  /** Unique identifier of the like record. Used for referencing and relational mapping. */
  @Field(() => ID)
  id: number;

  /** Timestamp indicating when the like was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Identifier of the user who performed the like. */
  @Field(() => Int, {
    nullable: true,
  })
  userId: number;

  /** Optional full user object associated with this like. */
  @Field(() => User, {
    nullable: true,
  })
  user?: User;

  /** Identifier of the post that was liked. */
  @Field(() => Int)
  postId: number;
}

import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { User } from "@/users/models/user.model";

/** Core representation of a Like entity. Connects a user to a post and exposes minimal relational data. */
@ObjectType()
export class Like {
  /** Unique identifier of the like record. Used for referencing and relational mapping. */
  @Field(() => ID)
  id: number;

  /** Timestamp indicating when the like was created. */
  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  /** Presentation-friendly UTC timestamp for when the like was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

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

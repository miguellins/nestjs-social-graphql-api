import { Field, ID, Int, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";

import { User } from "src/users/models/users.model";

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

  /*
  @Field(() => Post, { nullable: true })
  post?: Post;
  */
}

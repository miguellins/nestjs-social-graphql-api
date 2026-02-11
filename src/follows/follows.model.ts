import { Field, ID, ObjectType } from "@nestjs/graphql";

import { User } from "src/users/models/users.model";

@ObjectType()
export class Follow {
  @Field(() => ID)
  id: number;

  @Field()
  followerId: number;

  @Field()
  followingId: number;

  @Field(() => User, { nullable: true })
  follower?: User;

  @Field(() => User, { nullable: true })
  following?: User;
}

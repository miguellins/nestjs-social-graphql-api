import { Field, ID, ObjectType } from "@nestjs/graphql";
import { Follow } from "src/follows/follows.model";

import { Like } from "src/likes/likes.model";

//import { Follow } from "src/follows/follows.model";

import { Post } from "src/posts/posts.model";

@ObjectType()
export class User {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field()
  username: string;

  @Field()
  password: string;

  @Field(() => [Post], { nullable: true })
  posts?: Post[];

  @Field(() => [Like], { nullable: true })
  likes?: Like[];

  @Field(() => [Follow], { nullable: true })
  followers?: Follow[];

  @Field(() => [Follow], { nullable: true })
  following?: Follow[];
}

import { Field, ID, ObjectType } from "@nestjs/graphql";

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

  @Field(() => [Post])
  posts?: Post[];

  @Field(() => [Like])
  likes?: Like[];

  /*
  @Field(() => [Follow])
  followers: Follow[];

  @Field(() => [Follow])
  following: Follow[];
  */
}

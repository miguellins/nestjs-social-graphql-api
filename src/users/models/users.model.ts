//# DELETE IF NOT FOUND ANY USE OF THIS

import {
  Field,
  GraphQLISODateTime,
  HideField,
  ID,
  ObjectType,
} from "@nestjs/graphql";

import { Post } from "src/posts/models/posts.model";

import { Follow } from "src/follows/follows.model";

import { Like } from "src/likes/models/likes.model";

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

  @HideField()
  password: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => [Post], { nullable: true })
  posts?: Post[];

  @Field(() => [Like], { nullable: true })
  likes?: Like[];

  @Field(() => [Follow], { nullable: true })
  followers?: Follow[];

  @Field(() => [Follow], { nullable: true })
  following?: Follow[];
}

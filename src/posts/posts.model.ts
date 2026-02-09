import { Field, ID, Int, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";

import { User } from "../users/users.model";

import { Like } from "src/likes/likes.model";

@ObjectType()
export class Post {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => Int, { nullable: true })
  authorId: number;

  @Field(() => User, { nullable: true })
  author?: User;

  @Field(() => [Like], { nullable: true })
  likes?: Like[];

  @Field(() => Int, { nullable: true })
  likesCount: number;
}

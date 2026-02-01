import { Field, ID, Int, ObjectType } from "@nestjs/graphql";
import { GraphQLISODateTime } from "@nestjs/graphql";
import { User } from "../users/users.model";

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

  @Field(() => Int)
  authorId: number;

  @Field(() => User)
  author: User;

  @Field(() => Like)
  author: Like;
}

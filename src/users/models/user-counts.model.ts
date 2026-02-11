import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class UserCounts {
  @Field(() => Int)
  posts: number;

  @Field(() => Int)
  likes: number;

  @Field(() => Int)
  followers: number;

  @Field(() => Int)
  following: number;
}

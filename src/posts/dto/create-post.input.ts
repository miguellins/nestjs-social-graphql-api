import { Field, InputType, Int } from "@nestjs/graphql";

@InputType()
export class CreatePostInput {
  @Field()
  title: string;

  @Field()
  content: string;

  @Field(() => Int)
  authorId: number;
}

import { Field, InputType, Int } from "@nestjs/graphql";

import { IsInt, IsPositive } from "class-validator";

@InputType()
export class AttachMediaToPostInput {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  postId: number;

  @Field(() => Int)
  @IsInt()
  @IsPositive()
  mediaId: number;
}

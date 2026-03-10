import { IsInt, Min } from "class-validator";

import { ArgsType, Field, Int } from "@nestjs/graphql";

@ArgsType()
export class DeleteCommentArgs {
  @Field(() => Int, { description: "Target comment id" })
  @IsInt()
  @Min(1)
  commentId: number;
}

import { IsInt, Min } from "class-validator";

import { ArgsType, Field, Int } from "@nestjs/graphql";

@ArgsType()
export class DeleteCommentArgs {
  @Field(() => Int, { description: "Unique id of the target comment." })
  @IsInt()
  @Min(1)
  commentId!: number;
}

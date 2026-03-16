import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, Min } from "class-validator";

@ArgsType()
export class DeleteCommentArgs {
  /** Unique id of the target comment. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  commentId!: number;
}

import { IsInt, Min } from "class-validator";

import { ArgsType, Field, Int } from "@nestjs/graphql";

@ArgsType()
export class DeleteCommentArgs {
  /** Unique id of the target comment. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  commentId!: number;
}

import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

import { UpdateCommentInput } from "@/comments/dto/update-comment.input";

/**
 * GraphQL args for comment updates
 *
 * Wraps the update-comment input and target comment id for mutations
 */

@ArgsType()
export class UpdateCommentArgs {
  /** Unique id of the target comment. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  commentId!: number;

  /** Payload used to update an existing comment. */
  @Field(() => UpdateCommentInput)
  @ValidateNested()
  @Type(() => UpdateCommentInput)
  input!: UpdateCommentInput;
}

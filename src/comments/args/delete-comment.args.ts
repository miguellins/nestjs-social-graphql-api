import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, Min } from "class-validator";

/**
 * GraphQL args for comment deletion
 *
 * Validates the target comment id
 */

@ArgsType()
export class DeleteCommentArgs {
  /** Unique id of the target comment. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  commentId!: number;
}

import { Field, InputType, Int } from "@nestjs/graphql";

import {
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

/**
 * GraphQL input for comment creation
 *
 * Validates the data sent to create a comment
 */

@InputType()
export class CreateCommentInput {
  /** Text content of the comment. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(1000)
  content: string;

  /** Unique identifier of the post that will receive the new comment. */
  @Field(() => Int)
  @IsInt()
  postId: number;
}

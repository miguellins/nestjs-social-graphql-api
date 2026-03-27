import { InputType } from "@nestjs/graphql";

import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

/**
 * GraphQL input for comment updates
 *
 * Validates the data sent to update a comment
 */

@InputType()
export class UpdateCommentInput {
  /** Updated text content of the comment. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(1000)
  content: string;
}

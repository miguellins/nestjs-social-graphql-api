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
 * GraphQL input used to create a new comment on a post
 *
 * What it does:
 * - receives the comment text from the client
 * - receives the target post ID
 * - validates the input before it reaches the service layer
 * - trims extra spaces from the comment content
 */

@InputType()
export class CreateCommentInput {
  @Field()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(1000)
  content: string;

  @Field(() => Int)
  @IsInt()
  postId: number;
}

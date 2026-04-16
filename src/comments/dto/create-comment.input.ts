import { Field, InputType, Int } from "@nestjs/graphql";

import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

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

  /** Optional top-level comment id when creating a direct reply. */
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  parentCommentId?: number;
}

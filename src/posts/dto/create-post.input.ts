import { Field, InputType } from "@nestjs/graphql";

import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

/**
 * GraphQL input for post creation
 *
 * Validates the data sent to create a post
 */

@InputType()
export class CreatePostInput {
  /** Title shown for the post. */
  @Field({ nullable: true })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  title?: string | null;

  /** Main textual body of the post. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(2000)
  content: string;
}

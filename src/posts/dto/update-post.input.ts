import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { Trim } from "src/common/transformer/trim.transformer";

import { Field, InputType } from "@nestjs/graphql";

/**
 * GraphQL Input Type used when updating an existing post
 *
 * What it does:
 * - Validates incoming data before it reaches the service layer
 * - Allows partial updates (PATCH-style behavior)
 * - Normalizes string input to maintain database consistency
 * - Prevents empty or malformed values from being stored
 *
 * Security role:
 * - Second defensive layer after authentication
 * - Ensures only properly formatted data is processed
 */

@InputType()
export class UpdatePostInput {
  @Field({ nullable: true })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  title?: string;

  @Field({ nullable: true })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MinLength(3)
  @MaxLength(200)
  content?: string;
}

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Normalize } from "@/common/transformer/normalize.transformer";
import { Trim } from "@/common/transformer/trim.transformer";

import { InputType } from "@nestjs/graphql";

/**
 * GraphQL input used to update a user
 *
 * Supports partial updates and validates provided fields before they reach the service layer
 */

@InputType()
export class UpdateUserInput {
  /** Updated public display name. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  @IsOptional()
  name?: string;

  @Normalize()
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  @IsOptional()
  email?: string;

  /** Updated public username used in the platform. */
  @Trim()
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(15)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "username can only contain letters, numbers and underscore",
  })
  @IsNotEmpty()
  username?: string;

  /** Updated plain-text password that will be re-hashed before persistence. */
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  @IsOptional()
  password?: string;
}

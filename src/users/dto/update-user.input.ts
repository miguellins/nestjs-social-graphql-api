import { InputType } from "@nestjs/graphql";

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

import {
  USERNAME_REGEX,
  USERNAME_REGEX_MESSAGE,
} from "@/users/constants/username.constants";

/**
 * GraphQL input for user updates
 *
 * Validates partial user data before it reaches the service layer
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
  @Matches(USERNAME_REGEX, {
    message: USERNAME_REGEX_MESSAGE,
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

import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

import { InputType } from "@nestjs/graphql";

/**
 * GraphQL input used to create a user
 *
 * Validates and trims client input before it reaches the service layer
 */

@InputType()
export class CreateUserInput {
  /** Public display name chosen by the user. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  name: string;

  /** Email address used for login and account identification. */
  @Trim()
  @IsEmail()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  email: string;

  /** Public username used for mention and login flows. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(15)
  // Prevents special characters
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "username can only contain letters, numbers and underscore",
  })
  username: string;

  // accepted as input, but never returned
  /** Plain-text password that will be hashed before persistence. */
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  // Bcrypt input limit best-practice
  @MaxLength(72)
  password: string;
}

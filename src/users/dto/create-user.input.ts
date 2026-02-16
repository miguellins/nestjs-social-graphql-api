import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Trim } from "src/common/transformer/trim.transformer";

import { Field, InputType } from "@nestjs/graphql";

/**
 * GraphQL Input Type used when creating a new user
 *
 * What it does:
 * - Validates incoming data at the API boundary
 * - Prevents bad data from reaching the database
 * - Enforces consistent formatting
 * - Improves security
 *
 * Acts as the first security layer
 */

@InputType()
export class CreateUserInput {
  @Field()
  // Remove whitespace from both ends
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  name: string;

  @Field()
  // Remove whitespace from both ends and converts all characteres to lowercase
  @Trim()
  @IsEmail()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  email: string;

  @Field()
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
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  // Bcrypt input limit best-practice
  @MaxLength(72)
  password: string;
}

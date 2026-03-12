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
 * GraphQL Input Type used when updating an existing user
 *
 * What it does:
 * - Validates partial updates safely
 * - Allows flexible mutations without requiring all fields
 * - Normalizes incoming data before it reaches the service layer
 * - Protects database integrity
 *
 * Security benefits:
 * - Prevents empty or malformed updates
 * - Restricts username format
 * - Enforces password length best-practices (bcrypt-safe)
 * - Avoids invalid email formats
 *
 * Design note:
 * All fields are optional because updates are PATCH-style
 * Only the provided fields will be modified
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

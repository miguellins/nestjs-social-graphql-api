import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Field, InputType } from "@nestjs/graphql";

import { Transform } from "class-transformer";

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
  @Field({ nullable: true })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  @IsOptional()
  name?: string;

  @Field({ nullable: true })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  @IsOptional()
  email?: string;

  @Field({ nullable: true })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(15)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "username can only contain letters, numbers and underscore",
  })
  @IsNotEmpty()
  username?: string;

  @Field({ nullable: true })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(72)
  @IsOptional()
  password?: string;
}

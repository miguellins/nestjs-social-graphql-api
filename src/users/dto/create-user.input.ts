import { Field, InputType } from "@nestjs/graphql";

import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Transform } from "class-transformer";

@InputType()
export class CreateUserInput {
  @Field()
  // Remove whitespace from both ends
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  name: string;

  @Field()
  // Remove whitespace from both ends and converts all characteres to lowercase
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(20)
  email: string;

  @Field()
  // Remove whitespace from both ends
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
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

import { Field, InputType } from "@nestjs/graphql";

import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

import { Transform } from "class-transformer";

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

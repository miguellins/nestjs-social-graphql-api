import { Field, InputType } from "@nestjs/graphql";

import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

import { Transform } from "class-transformer";

@InputType()
export class UpdatePostInput {
  @Field({ nullable: true })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MinLength(3)
  @MaxLength(50)
  title?: string;

  @Field({ nullable: true })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  @MinLength(3)
  @MaxLength(200)
  content?: string;
}

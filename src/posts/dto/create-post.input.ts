import { Field, InputType, Int } from "@nestjs/graphql";

import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

import { Transform } from "class-transformer";

@InputType()
export class CreatePostInput {
  @Field()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  title: string;

  @Field()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  content: string;
}

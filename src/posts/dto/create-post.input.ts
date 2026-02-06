import { IsNotEmpty, IsString, MinLength } from "class-validator";

import { Field, InputType, Int } from "@nestjs/graphql";

@InputType()
export class CreatePostInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  title: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  content: string;
}

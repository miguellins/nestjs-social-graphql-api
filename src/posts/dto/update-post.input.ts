import { IsNotEmpty, IsOptional, IsString } from "class-validator";

import { Field, InputType } from "@nestjs/graphql";

@InputType()
export class UpdatePostInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  title?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  content?: string;
}

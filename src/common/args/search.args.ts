import { IsOptional, IsString, MaxLength } from "class-validator";

import { ArgsType, Field } from "@nestjs/graphql";

@ArgsType()
export class SearchArgs {
  @Field({ nullable: true, description: "Search query" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;
}

import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { ArgsType, Field, Int } from "@nestjs/graphql";

@ArgsType()
export class FindPostsArgs {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  q?: string;
}

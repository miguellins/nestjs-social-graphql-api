import { IsInt, IsOptional, Max, Min } from "class-validator";

import { ArgsType, Field, Int } from "@nestjs/graphql";

@ArgsType()
export class UsersArgs {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  // Match the hard cap in service
  @Max(50)
  take?: number;
}

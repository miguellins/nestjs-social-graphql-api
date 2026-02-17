import { IsInt, IsOptional, Max, Min } from "class-validator";

import { ArgsType, Field, Int } from "@nestjs/graphql";

@ArgsType()
export class PaginationArgs {
  @Field(() => Int, {
    nullable: true,
    description: "Max items to return (1-50)",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  // Match the hard cap in service
  @Max(50)
  take?: number;
}

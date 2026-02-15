import { IsInt, IsOptional, Max, Min } from "class-validator";

import { ArgsType, Field, Int } from "@nestjs/graphql";

@ArgsType()
export class FindLikesArgs {
  @Field(() => Int, {
    nullable: true,
    description: "Max items to return (1-50)",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  take?: number;

  @Field(() => Int, { nullable: true, description: "Filter likes by post id" })
  @IsOptional()
  @IsInt()
  @Min(1)
  postId?: number;

  @Field(() => Int, { nullable: true, description: "Filter likes by user id" })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;
}

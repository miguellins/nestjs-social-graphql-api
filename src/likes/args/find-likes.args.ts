import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, IsOptional, Min } from "class-validator";

import { PaginationArgs } from "@/common/args/pagination.args";

@ArgsType()
export class FindLikesArgs extends PaginationArgs {
  // Optional filter by post
  @Field(() => Int, {
    nullable: true,
    description: "Return only likes that belong to this post id.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  postId?: number;

  // Optional filter by user
  @Field(() => Int, {
    nullable: true,
    description: "Return only likes created by this user id.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;
}

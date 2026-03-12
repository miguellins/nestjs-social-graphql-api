import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, IsOptional, Min } from "class-validator";

import { PaginationArgs } from "@/common/args/pagination.args";

@ArgsType()
export class FindLikesArgs extends PaginationArgs {
  // Optional filter by post
  /** Return only likes that belong to this post id. */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  postId?: number;

  // Optional filter by user
  /** Return only likes created by this user id. */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number;
}

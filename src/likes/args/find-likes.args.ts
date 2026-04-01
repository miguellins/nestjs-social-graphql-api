import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, IsOptional, Min } from "class-validator";

import { PaginationArgs } from "@/common/args/pagination.args";

@ArgsType()
export class FindLikesArgs extends PaginationArgs {
  /** Return only likes that belong to this post id. */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  postId?: number;

  /** Return only likes created by this user id. Use 0 to disable this filter. */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  userId?: number;
}

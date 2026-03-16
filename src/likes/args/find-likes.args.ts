import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, IsOptional, Min } from "class-validator";

import { PaginationArgs } from "@/common/args/pagination.args";

/**
 * GraphQL args for like queries
 *
 * Validates the target post id and list options
 */

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
  /** Return only likes created by this user id. Use 0 to disable this filter. */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  userId?: number;
}

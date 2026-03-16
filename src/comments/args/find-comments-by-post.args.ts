import { ArgsType, Field, Int } from "@nestjs/graphql";

import { PaginationArgs } from "@/common/args/pagination.args";

import { IsInt, Min } from "class-validator";

/**
 * GraphQL args for post comment queries
 *
 * Validates the target post id and pagination options
 */

@ArgsType()
export class FindCommentsByPostArgs extends PaginationArgs {
  /** Unique id of the post whose comments should be returned. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  postId!: number;
}

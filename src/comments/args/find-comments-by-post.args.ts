import { ArgsType, Field, Int } from "@nestjs/graphql";

import { PaginationArgs } from "@/common/args/pagination.args";

import { IsInt, Min } from "class-validator";

@ArgsType()
export class FindCommentsByPostArgs extends PaginationArgs {
  /** Unique id of the post whose comments should be returned. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  postId!: number;
}

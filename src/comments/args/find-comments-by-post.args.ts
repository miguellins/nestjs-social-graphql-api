import { ArgsType, Field, Int } from "@nestjs/graphql";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

import { IsInt, Min } from "class-validator";

@ArgsType()
export class FindCommentsByPostArgs extends CursorPaginationArgs {
  /** Unique id of the post whose comments should be returned. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  postId!: number;
}

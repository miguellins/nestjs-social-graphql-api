import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, Min } from "class-validator";

import { PaginationArgs } from "@/common/args/pagination.args";

@ArgsType()
export class FindCommentsByPostArgs extends PaginationArgs {
  @Field(() => Int, {
    description: "Unique id of the post whose comments should be returned.",
  })
  @IsInt()
  @Min(1)
  postId!: number;
}

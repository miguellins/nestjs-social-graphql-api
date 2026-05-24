import { ArgsType, Field, Int } from "@nestjs/graphql";
import { IsInt, Min } from "class-validator";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

/** Cursor-paginated query arguments for public reposts of a source post. */
@ArgsType()
export class FindRepostsArgs extends CursorPaginationArgs {
  /** Source post id whose repost wrappers should be listed. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  postId: number;
}

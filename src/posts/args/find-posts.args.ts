import { ArgsType, Field } from "@nestjs/graphql";

import { IsOptional, IsString, MaxLength } from "class-validator";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { Trim } from "@/common/transformer/trim.transformer";

const MAX_QUERY_LENGTH = 50;

@ArgsType()
export class FindPostsArgs extends CursorPaginationArgs {
  /** Free-text search query for posts. Trimmed before validation. Max 50 characters. */
  @Field(() => String, {
    nullable: true,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;
}

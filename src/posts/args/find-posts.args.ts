import { ArgsType, Field } from "@nestjs/graphql";

import { IsOptional, IsString, MaxLength } from "class-validator";

import { PaginationArgs } from "@/common/args/pagination.args";
import { Trim } from "@/common/transformer/trim.transformer";

const MAX_QUERY_LENGTH = 50;

@ArgsType()
export class FindPostsArgs extends PaginationArgs {
  // Optional free-text query used to search posts
  @Field(() => String, {
    nullable: true,
    description: `Free-text search query for posts. Trimmed before validation. Max ${MAX_QUERY_LENGTH} characters.`,
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(MAX_QUERY_LENGTH)
  q?: string;
}

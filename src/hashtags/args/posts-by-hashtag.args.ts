import { ArgsType, Field } from "@nestjs/graphql";

import { IsString, MaxLength } from "class-validator";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { Trim } from "@/common/transformer/trim.transformer";

/** GraphQL args for reading cursor-paginated posts attached to one hashtag. */
@ArgsType()
export class PostsByHashtagArgs extends CursorPaginationArgs {
  /** Hashtag slug to read, with or without the leading #. */
  @Field(() => String)
  @Trim()
  @IsString()
  @MaxLength(33)
  hashtag!: string;
}

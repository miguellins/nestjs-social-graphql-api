import { ArgsType, Field, Int } from "@nestjs/graphql";

import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { Trim } from "@/common/transformer/trim.transformer";

/** GraphQL args for relevance-ranked post discovery. */
@ArgsType()
export class SearchPostsArgs {
  /** Search text matched against post titles and content. */
  @Field(() => String)
  @Trim()
  @IsString()
  @MaxLength(100)
  q!: string;

  /** Maximum number of posts to return (1-${PAGINATION.MAX_TAKE}). */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_TAKE)
  first?: number;
}

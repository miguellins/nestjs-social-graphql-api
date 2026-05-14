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

/** GraphQL args for prefix hashtag discovery. */
@ArgsType()
export class SearchHashtagsArgs {
  /** Prefix query for hashtag slug autocomplete, with or without leading #. */
  @Field(() => String)
  @Trim()
  @IsString()
  @MaxLength(33)
  q!: string;

  /** Maximum number of hashtags to return (1-${PAGINATION.MAX_TAKE}). */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_TAKE)
  first?: number;
}

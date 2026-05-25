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

/** GraphQL args for relevance-ranked user discovery. */
@ArgsType()
export class SearchUsersArgs {
  /** Search text matched against public username and name fields. */
  @Field(() => String)
  @Trim()
  @IsString()
  @MaxLength(50)
  q!: string;

  /** Maximum number of users to return (1-${PAGINATION.MAX_TAKE}). */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_TAKE)
  first?: number;
}

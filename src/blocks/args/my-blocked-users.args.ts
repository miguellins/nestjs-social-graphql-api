import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { PAGINATION } from "@/common/constants/hard-cap.constants";

@ArgsType()
export class MyBlockedUsersArgs {
  /** Maximum number of blocked users to return (1-${PAGINATION.MAX_TAKE}). */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_TAKE)
  first?: number;

  /** Cursor for the last item from the previous page. */
  @Field(() => String, {
    nullable: true,
  })
  @IsOptional()
  @IsString()
  after?: string;
}

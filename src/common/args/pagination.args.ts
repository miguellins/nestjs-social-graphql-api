import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { PAGINATION } from "@/common/constants/hard-cap.constants";

@ArgsType()
export class PaginationArgs {
  /** Maximum number of items to return (1-${PAGINATION.MAX_TAKE}). */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_TAKE)
  take?: number;

  /** Controls chronological ordering for list results. */
  @Field(() => ChronologicalOrder, {
    nullable: true,
  })
  @IsOptional()
  @IsEnum(ChronologicalOrder)
  orderBy?: ChronologicalOrder;
}

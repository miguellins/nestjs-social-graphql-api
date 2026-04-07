import { ArgsType, Field, Int } from "@nestjs/graphql";

import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { PAGINATION } from "@/common/constants/hard-cap.constants";

@ArgsType()
export class CursorPaginationArgs {
  /** Maximum number of items to return (1-${PAGINATION.MAX_TAKE}). */
  @Field(() => Int, {
    nullable: true,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(PAGINATION.MAX_TAKE)
  first?: number;

  /** Cursor for the last item from the previous page. Reuse it only with the same filter and ordering inputs. */
  @Field(() => String, {
    nullable: true,
  })
  @IsOptional()
  @IsString()
  after?: string;

  /** Controls chronological ordering for paged list results. */
  @Field(() => ChronologicalOrder, {
    nullable: true,
  })
  @IsOptional()
  @IsEnum(ChronologicalOrder)
  orderBy?: ChronologicalOrder;
}

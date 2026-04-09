import { ArgsType, Field } from "@nestjs/graphql";

import { IsEnum, IsOptional } from "class-validator";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";

import { ReportTargetType } from "@/reports/enums/report-target-type.enum";
import { ReportStatus } from "@/reports/enums/report-status.enum";

/** GraphQL arguments for reviewing reports with bounded cursor pagination and moderation filters. */
@ArgsType()
export class FindReviewReportsArgs extends CursorPaginationArgs {
  /** Optional filter for the moderation status currently assigned to each report. */
  @Field(() => ReportStatus, {
    nullable: true,
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  /** Optional filter for limiting the review list to post or comment reports. */
  @Field(() => ReportTargetType, {
    nullable: true,
  })
  @IsOptional()
  @IsEnum(ReportTargetType)
  targetType?: ReportTargetType;
}

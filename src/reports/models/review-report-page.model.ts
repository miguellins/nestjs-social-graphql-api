import { Field, ObjectType } from "@nestjs/graphql";

import { ReviewReport } from "@/reports/models/review-report.model";
import { PageInfo } from "@/common/models/page-info.model";

/** Cursor-paginated page of moderation review reports plus navigation metadata. */
@ObjectType()
export class ReviewReportPage {
  /** Items returned for the current page. */
  @Field(() => [ReviewReport])
  items!: ReviewReport[];

  /** Cursor navigation metadata for the current page. */
  @Field(() => PageInfo)
  pageInfo!: PageInfo;
}

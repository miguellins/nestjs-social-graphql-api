import {
  Field,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from "@nestjs/graphql";

import { FormattedDateTimeField } from "@/graphql/fields/formatted-date-time-field.decorator";

import { SafeUserPreview } from "@/users/models/safe-user-preview.model";

import { ReportTargetType } from "@/reports/enums/report-target-type.enum";
import { ReportReason } from "@/reports/enums/report-reason.enum";
import { ReportStatus } from "@/reports/enums/report-status.enum";

/** Safe moderation review representation of a submitted content report. */
@ObjectType()
export class ReviewReport {
  /** Unique identifier of the report. */
  @Field(() => ID)
  id!: number;

  /** Indicates whether the report targets a post or a comment. */
  @Field(() => ReportTargetType)
  targetType!: ReportTargetType;

  /** Identifier of the reported post or comment. */
  @Field(() => Int)
  targetId!: number;

  /** Product-facing category explaining why the content was reported. */
  @Field(() => ReportReason)
  reason!: ReportReason;

  /** Optional reporter-provided context shown to moderators during review. */
  @Field({
    nullable: true,
  })
  details!: string | null;

  /** Current moderation review state of the report. */
  @Field(() => ReportStatus)
  status!: ReportStatus;

  /** Timestamp indicating when the report was created. */
  @Field(() => GraphQLISODateTime)
  createdAt!: Date;

  /** Presentation-friendly UTC timestamp for when the report was created. */
  @FormattedDateTimeField("createdAt")
  createdAtFormatted?: string;

  /** Safe preview of the user who submitted the report. */
  @Field(() => SafeUserPreview)
  reporter!: SafeUserPreview;
}

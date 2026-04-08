import { Field, InputType, Int } from "@nestjs/graphql";

import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

import { Trim } from "@/common/transformer/trim.transformer";

import { ReportReason } from "@/reports/enums/report-reason.enum";

/** GraphQL input for reporting a comment with a reason and optional details. */
@InputType()
export class ReportCommentInput {
  /** Unique identifier of the comment being reported. */
  @Field(() => Int)
  @IsInt()
  @Min(1)
  commentId: number;

  /** Product-facing category for why the comment is being reported. */
  @Field(() => ReportReason)
  @IsEnum(ReportReason)
  reason: ReportReason;

  /** Optional extra reporter-provided context about the issue. */
  @Field({
    nullable: true,
  })
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;
}

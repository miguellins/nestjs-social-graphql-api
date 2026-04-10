import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Roles } from "@/common/decorators/auth.decorator";

import { FindReviewReportsArgs } from "@/reports/args/find-review-reports.args";
import { ReviewReportPage } from "@/reports/models/review-report-page.model";
import { ReportCommentInput } from "@/reports/dto/report-comment.input";
import { ReportPostInput } from "@/reports/dto/report-post.input";
import { ReportsService } from "@/reports/reports.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { MODERATION_ROLES } from "@/users/enums/user-role.enum";

@Resolver()
export class ReportsResolver {
  constructor(private readonly reportsService: ReportsService) {}

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "reportPost" })
  async reportPost(
    @Args("input") input: ReportPostInput,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.reportsService.reportPost(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "reportComment" })
  async reportComment(
    @Args("input") input: ReportCommentInput,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.reportsService.reportComment(input, user.id);
  }

  @Roles(...MODERATION_ROLES)
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => ReviewReportPage, { name: "reviewReports" })
  async reviewReports(
    @Args() args: FindReviewReportsArgs,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewReportPage> {
    return this.reportsService.reviewReports(args, user);
  }

  @Roles(...MODERATION_ROLES)
  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "dismissReport" })
  async dismissReport(
    @Args("reportId", { type: () => Int }) reportId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.reportsService.dismissReport(reportId, user);
  }

  @Roles(...MODERATION_ROLES)
  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "actionReport" })
  async actionReport(
    @Args("reportId", { type: () => Int }) reportId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.reportsService.actionReport(reportId, user);
  }
}

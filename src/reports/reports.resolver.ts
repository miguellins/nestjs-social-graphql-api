import { Args, Mutation, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";

import { ReportCommentInput } from "@/reports/dto/report-comment.input";
import { ReportPostInput } from "@/reports/dto/report-post.input";
import { ReportsService } from "@/reports/reports.service";

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
}

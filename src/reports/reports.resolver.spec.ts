import { ReportReason } from "@/reports/enums/report-reason.enum";

import { ReportsResolver } from "./reports.resolver";

describe("ReportsResolver", () => {
  it("forwards reportPost input and current user id to the service", async () => {
    const reportsService = {
      reportPost: jest.fn().mockResolvedValue({
        message: "Post reported successfully",
      }),
    };

    const resolver = new ReportsResolver(reportsService as never);

    await resolver.reportPost(
      {
        postId: 10,
        reason: ReportReason.SPAM,
        details: "spam post",
      },
      { id: 7 },
    );

    expect(reportsService.reportPost).toHaveBeenCalledWith(
      {
        postId: 10,
        reason: ReportReason.SPAM,
        details: "spam post",
      },
      7,
    );
  });

  it("forwards reportComment input and current user id to the service", async () => {
    const reportsService = {
      reportComment: jest.fn().mockResolvedValue({
        message: "Comment reported successfully",
      }),
    };

    const resolver = new ReportsResolver(reportsService as never);

    await resolver.reportComment(
      {
        commentId: 11,
        reason: ReportReason.HARASSMENT,
        details: "abusive comment",
      },
      { id: 8 },
    );

    expect(reportsService.reportComment).toHaveBeenCalledWith(
      {
        commentId: 11,
        reason: ReportReason.HARASSMENT,
        details: "abusive comment",
      },
      8,
    );
  });
});

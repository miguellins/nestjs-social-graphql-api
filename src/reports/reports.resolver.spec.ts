import { ReportReason } from "@/reports/enums/report-reason.enum";
import { USER_ROLE } from "@/users/enums/user-role.enum";

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

  it("forwards reviewReports args and current user to the service", async () => {
    const reportsService = {
      reviewReports: jest.fn().mockResolvedValue({
        items: [],
        pageInfo: { endCursor: null, hasNextPage: false },
      }),
    };

    const resolver = new ReportsResolver(reportsService as never);

    await resolver.reviewReports(
      { first: 10, status: "OPEN" as never, targetType: "POST" as never },
      { id: 3, role: USER_ROLE.MODERATOR },
    );

    expect(reportsService.reviewReports).toHaveBeenCalledWith(
      { first: 10, status: "OPEN", targetType: "POST" },
      { id: 3, role: USER_ROLE.MODERATOR },
    );
  });

  it("forwards dismissReport to the service", async () => {
    const reportsService = {
      dismissReport: jest.fn().mockResolvedValue({
        message: "Report dismissed successfully",
      }),
    };

    const resolver = new ReportsResolver(reportsService as never);

    await resolver.dismissReport(10, { id: 4, role: USER_ROLE.ADMIN });

    expect(reportsService.dismissReport).toHaveBeenCalledWith(10, {
      id: 4,
      role: USER_ROLE.ADMIN,
    });
  });

  it("forwards actionReport to the service", async () => {
    const reportsService = {
      actionReport: jest.fn().mockResolvedValue({
        message: "Report actioned successfully",
      }),
    };

    const resolver = new ReportsResolver(reportsService as never);

    await resolver.actionReport(11, { id: 5, role: USER_ROLE.MODERATOR });

    expect(reportsService.actionReport).toHaveBeenCalledWith(11, {
      id: 5,
      role: USER_ROLE.MODERATOR,
    });
  });
});

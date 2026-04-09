import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { Prisma } from "@prisma/client";

import { PrismaService } from "@/prisma/prisma.service";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { ReviewReportSelect } from "@/reports/dto/review-report.dto";
import { ReportReason } from "@/reports/enums/report-reason.enum";
import { ReportStatus } from "@/reports/enums/report-status.enum";
import { ReportTargetType } from "@/reports/enums/report-target-type.enum";
import { USER_ROLE } from "@/users/enums/user-role.enum";

import { ReportsService } from "./reports.service";

const OPEN_REPORT_STATUS = ReportStatus.OPEN;

describe("ReportsService", () => {
  let service: ReportsService;
  let moduleRef: TestingModule;

  const prismaMock = {
    post: {
      findUnique: jest.fn(),
    },
    comment: {
      findUnique: jest.fn(),
    },
    contentReport: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = moduleRef.get(ReportsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("reportPost", () => {
    it("creates a post report successfully", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 5, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue(null);
      prismaMock.contentReport.create.mockResolvedValue({ id: 10 });

      await expect(
        service.reportPost(
          {
            postId: 5,
            reason: ReportReason.SPAM,
            details: "spam post",
          },
          1,
        ),
      ).resolves.toEqual({
        message: "Post reported successfully",
      });

      expect(prismaMock.contentReport.create).toHaveBeenCalledWith({
        data: {
          reporterId: 1,
          postId: 5,
          reason: ReportReason.SPAM,
          details: "spam post",
          status: OPEN_REPORT_STATUS,
        },
        select: { id: true },
      });
    });

    it("throws NotFound when post does not exist", async () => {
      prismaMock.post.findUnique.mockResolvedValue(null);

      await expect(
        service.reportPost({ postId: 5, reason: ReportReason.SPAM }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects self-reporting a post", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 5, authorId: 1 });

      await expect(
        service.reportPost({ postId: 5, reason: ReportReason.SPAM }, 1),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects duplicate open post reports", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 5, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue({ id: 99 });

      await expect(
        service.reportPost({ postId: 5, reason: ReportReason.SPAM }, 1),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("rejects too-long details with BadRequest", async () => {
      await expect(
        service.reportPost(
          {
            postId: 5,
            reason: ReportReason.SPAM,
            details: "a".repeat(501),
          },
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.post.findUnique).not.toHaveBeenCalled();
    });

    it("maps known Prisma duplicate errors to ConflictException", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 5, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue(null);
      prismaMock.contentReport.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(
        service.reportPost({ postId: 5, reason: ReportReason.SPAM }, 1),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("maps known missing-target persistence failures to NotFound", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 5, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue(null);
      prismaMock.contentReport.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("missing", {
          code: "P2025",
          clientVersion: "test",
        }),
      );

      await expect(
        service.reportPost({ postId: 5, reason: ReportReason.SPAM }, 1),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws sanitized fallback on unexpected post report failure", async () => {
      prismaMock.post.findUnique.mockResolvedValue({ id: 5, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue(null);
      prismaMock.contentReport.create.mockRejectedValue(new Error("boom"));

      const loggerSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      await expect(
        service.reportPost({ postId: 5, reason: ReportReason.SPAM }, 1),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(loggerSpy).toHaveBeenCalledWith(
        "Unexpected persistence failure while trying to report post",
        expect.any(String),
      );
    });
  });

  describe("reportComment", () => {
    it("creates a comment report successfully", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ id: 8, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue(null);
      prismaMock.contentReport.create.mockResolvedValue({ id: 11 });

      await expect(
        service.reportComment(
          {
            commentId: 8,
            reason: ReportReason.HARASSMENT,
            details: "abusive comment",
          },
          1,
        ),
      ).resolves.toEqual({
        message: "Comment reported successfully",
      });

      expect(prismaMock.contentReport.create).toHaveBeenCalledWith({
        data: {
          reporterId: 1,
          commentId: 8,
          reason: ReportReason.HARASSMENT,
          details: "abusive comment",
          status: OPEN_REPORT_STATUS,
        },
        select: { id: true },
      });
    });

    it("throws NotFound when comment does not exist", async () => {
      prismaMock.comment.findUnique.mockResolvedValue(null);

      await expect(
        service.reportComment(
          { commentId: 8, reason: ReportReason.HARASSMENT },
          1,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects self-reporting a comment", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ id: 8, authorId: 1 });

      await expect(
        service.reportComment(
          { commentId: 8, reason: ReportReason.HARASSMENT },
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects duplicate open comment reports", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ id: 8, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue({ id: 100 });

      await expect(
        service.reportComment(
          { commentId: 8, reason: ReportReason.HARASSMENT },
          1,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("maps known missing-target persistence failures to NotFound", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ id: 8, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue(null);
      prismaMock.contentReport.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("missing", {
          code: "P2003",
          clientVersion: "test",
        }),
      );

      await expect(
        service.reportComment(
          { commentId: 8, reason: ReportReason.HARASSMENT },
          1,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects too-long comment details with BadRequest", async () => {
      await expect(
        service.reportComment(
          {
            commentId: 8,
            reason: ReportReason.HARASSMENT,
            details: "a".repeat(501),
          },
          1,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prismaMock.comment.findUnique).not.toHaveBeenCalled();
    });

    it("throws sanitized fallback on unexpected comment report failure", async () => {
      prismaMock.comment.findUnique.mockResolvedValue({ id: 8, authorId: 2 });
      prismaMock.contentReport.findFirst.mockResolvedValue(null);
      prismaMock.contentReport.create.mockRejectedValue(new Error("boom"));

      const loggerSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      await expect(
        service.reportComment(
          { commentId: 8, reason: ReportReason.HARASSMENT },
          1,
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);

      expect(loggerSpy).toHaveBeenCalledWith(
        "Unexpected persistence failure while trying to report comment",
        expect.any(String),
      );
    });
  });

  describe("reviewReports", () => {
    it("allows moderators to list open reports with safe reporter previews", async () => {
      prismaMock.contentReport.findMany.mockResolvedValue([
        {
          id: 21,
          postId: 5,
          commentId: null,
          reason: ReportReason.SPAM,
          details: "spam links",
          status: ReportStatus.OPEN,
          createdAt: new Date("2026-04-08T00:00:00.000Z"),
          reporter: {
            id: 7,
            name: "Reporter",
            username: "reporter",
          },
        },
      ]);

      const result = await service.reviewReports(
        {
          first: 10,
        },
        { id: 1, role: USER_ROLE.MODERATOR },
      );

      expect(result.items).toEqual([
        {
          id: 21,
          targetType: "POST",
          targetId: 5,
          reason: ReportReason.SPAM,
          details: "spam links",
          status: ReportStatus.OPEN,
          createdAt: new Date("2026-04-08T00:00:00.000Z"),
          reporter: {
            id: 7,
            name: "Reporter",
            username: "reporter",
          },
        },
      ]);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toEqual(expect.any(String));

      expect(prismaMock.contentReport.findMany).toHaveBeenCalledWith({
        take: 11,
        where: {
          status: ReportStatus.OPEN,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: ReviewReportSelect,
      });
    });

    it("allows admins to filter review reports by status and target type", async () => {
      prismaMock.contentReport.findMany.mockResolvedValue([]);

      await service.reviewReports(
        {
          first: 5,
          status: ReportStatus.ACTIONED,
          targetType: ReportTargetType.COMMENT,
        },
        { id: 2, role: USER_ROLE.ADMIN },
      );

      expect(prismaMock.contentReport.findMany).toHaveBeenCalledWith({
        take: 6,
        where: {
          status: ReportStatus.ACTIONED,
          commentId: { not: null },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: ReviewReportSelect,
      });
    });

    it("applies cursor pagination and deterministic oldest-first ordering", async () => {
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-08T00:00:00.000Z"),
        id: 20,
      });

      prismaMock.contentReport.findMany.mockResolvedValue([
        {
          id: 21,
          postId: 6,
          commentId: null,
          reason: ReportReason.SPAM,
          details: null,
          status: ReportStatus.OPEN,
          createdAt: new Date("2026-04-08T00:05:00.000Z"),
          reporter: {
            id: 7,
            name: "Reporter",
            username: "reporter",
          },
        },
        {
          id: 22,
          postId: null,
          commentId: 8,
          reason: ReportReason.HARASSMENT,
          details: null,
          status: ReportStatus.OPEN,
          createdAt: new Date("2026-04-08T00:06:00.000Z"),
          reporter: {
            id: 8,
            name: "Reporter Two",
            username: "reporter2",
          },
        },
      ]);

      const result = await service.reviewReports(
        {
          first: 1,
          after,
          orderBy: ChronologicalOrder.OLDEST,
        },
        { id: 2, role: USER_ROLE.MODERATOR },
      );

      expect(prismaMock.contentReport.findMany).toHaveBeenCalledWith({
        take: 2,
        where: {
          OR: [
            { createdAt: { gt: new Date("2026-04-08T00:00:00.000Z") } },
            {
              createdAt: new Date("2026-04-08T00:00:00.000Z"),
              id: { gt: 20 },
            },
          ],
          status: ReportStatus.OPEN,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: ReviewReportSelect,
      });
      expect(result.items).toHaveLength(1);
      expect(result.pageInfo.hasNextPage).toBe(true);
      expect(result.pageInfo.endCursor).toEqual(expect.any(String));
    });

    it("rejects non-moderators from listing reports", async () => {
      await expect(
        service.reviewReports({}, { id: 1, role: USER_ROLE.USER }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prismaMock.contentReport.findMany).not.toHaveBeenCalled();
    });
  });

  describe("dismissReport", () => {
    it("dismisses an open report successfully", async () => {
      prismaMock.contentReport.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.dismissReport(10, { id: 1, role: USER_ROLE.ADMIN }),
      ).resolves.toEqual({
        message: "Report dismissed successfully",
      });

      expect(prismaMock.contentReport.updateMany).toHaveBeenCalledWith({
        where: { id: 10, status: ReportStatus.OPEN },
        data: { status: ReportStatus.DISMISSED },
      });
    });

    it("throws NotFound when the report does not exist", async () => {
      prismaMock.contentReport.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.contentReport.findUnique.mockResolvedValue(null);

      await expect(
        service.dismissReport(10, { id: 1, role: USER_ROLE.ADMIN }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects invalid transitions for already reviewed reports", async () => {
      prismaMock.contentReport.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.contentReport.findUnique.mockResolvedValue({
        id: 10,
        status: ReportStatus.DISMISSED,
      });

      await expect(
        service.dismissReport(10, { id: 1, role: USER_ROLE.ADMIN }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("actionReport", () => {
    it("marks an open report as actioned successfully", async () => {
      prismaMock.contentReport.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.actionReport(12, { id: 1, role: USER_ROLE.MODERATOR }),
      ).resolves.toEqual({
        message: "Report actioned successfully",
      });

      expect(prismaMock.contentReport.updateMany).toHaveBeenCalledWith({
        where: { id: 12, status: ReportStatus.OPEN },
        data: { status: ReportStatus.ACTIONED },
      });
    });

    it("throws NotFound when actioning a missing report", async () => {
      prismaMock.contentReport.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.contentReport.findUnique.mockResolvedValue(null);

      await expect(
        service.actionReport(12, { id: 1, role: USER_ROLE.MODERATOR }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects actioning an already reviewed report", async () => {
      prismaMock.contentReport.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.contentReport.findUnique.mockResolvedValue({
        id: 12,
        status: ReportStatus.ACTIONED,
      });

      await expect(
        service.actionReport(12, { id: 1, role: USER_ROLE.MODERATOR }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("maps known persistence conflicts during actioning to BadRequest", async () => {
      prismaMock.contentReport.updateMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("duplicate", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(
        service.actionReport(12, { id: 1, role: USER_ROLE.MODERATOR }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

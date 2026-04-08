import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { Test, TestingModule } from "@nestjs/testing";

import { Prisma, ReportStatus } from "@prisma/client";

import { PrismaService } from "@/prisma/prisma.service";
import { ReportReason } from "@/reports/enums/report-reason.enum";

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
});

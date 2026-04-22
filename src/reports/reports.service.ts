import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { ReportTargetType } from "@/reports/enums/report-target-type.enum";
import { ReportReason } from "@/reports/enums/report-reason.enum";
import { ReportStatus } from "@/reports/enums/report-status.enum";
import {
  reportCommentCommandSchema,
  type ReportCommentCommand,
} from "@/reports/schemas/report-comment-command.schema";
import {
  reportPostCommandSchema,
  type ReportPostCommand,
} from "@/reports/schemas/report-post-command.schema";
import {
  reviewReportActionCommandSchema,
  type ReviewReportActionCommand,
} from "@/reports/schemas/review-report-action-command.schema";
import {
  reviewReportsCommandSchema,
  type ReviewReportsCommand,
} from "@/reports/schemas/review-reports-command.schema";
import {
  ReviewReportSelect,
  type ReviewReportDTO,
  type ReviewReportRow,
} from "@/reports/dto/review-report.dto";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { MODERATION_ROLE_SET } from "@/users/enums/user-role.enum";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

const OPEN_REPORT_STATUS = ReportStatus.OPEN;

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async reportPost(
    input:
      | ReportPostCommand
      | { postId: number; reason: ReportReason; details?: string },
    currentUserId: number,
  ): Promise<MessageResponse> {
    const data = this.parseReportPostInput(input);

    const post = await this.prisma.post.findUnique({
      where: { id: data.postId },
      select: { id: true, authorId: true, removedAt: true },
    });

    if (!post || post.removedAt) {
      throw new NotFoundException("Post not found");
    }

    if (post.authorId === currentUserId) {
      throw new BadRequestException("You cannot report your own post");
    }

    const existing = await this.prisma.contentReport.findFirst({
      where: {
        reporterId: currentUserId,
        postId: data.postId,
        status: OPEN_REPORT_STATUS,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("You already reported this post");
    }

    try {
      await this.prisma.contentReport.create({
        data: {
          reporterId: currentUserId,
          postId: data.postId,
          reason: data.reason,
          details: data.details,
          status: OPEN_REPORT_STATUS,
          openDedupKey: this.buildOpenPostReportDedupKey(
            currentUserId,
            data.postId,
          ),
        },
        select: { id: true },
      });
    } catch (err) {
      this.throwReportPersistenceFailure("post", err);
    }

    return {
      message: "Post reported successfully",
    };
  }

  async reportComment(
    input:
      | ReportCommentCommand
      | {
          commentId: number;
          reason: ReportReason;
          details?: string;
        },
    currentUserId: number,
  ): Promise<MessageResponse> {
    const data = this.parseReportCommentInput(input);

    const comment = await this.prisma.comment.findUnique({
      where: { id: data.commentId },
      select: { id: true, authorId: true, removedAt: true },
    });

    if (!comment || comment.removedAt) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.authorId === currentUserId) {
      throw new BadRequestException("You cannot report your own comment");
    }

    const existing = await this.prisma.contentReport.findFirst({
      where: {
        reporterId: currentUserId,
        commentId: data.commentId,
        status: OPEN_REPORT_STATUS,
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException("You already reported this comment");
    }

    try {
      await this.prisma.contentReport.create({
        data: {
          reporterId: currentUserId,
          commentId: data.commentId,
          reason: data.reason,
          details: data.details,
          status: OPEN_REPORT_STATUS,
          openDedupKey: this.buildOpenCommentReportDedupKey(
            currentUserId,
            data.commentId,
          ),
        },
        select: { id: true },
      });
    } catch (err) {
      this.throwReportPersistenceFailure("comment", err);
    }

    return {
      message: "Comment reported successfully",
    };
  }

  async reviewReports(
    input: ReviewReportsCommand,
    currentUser: AuthenticatedUser,
  ): Promise<CursorPageResult<ReviewReportDTO>> {
    this.assertCanReviewReports(currentUser);

    const data = this.parseReviewReportsInput(input);
    const take = normalizeCursorTake(data.first);
    const orderBy = data.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = data.after ? decodeChronoCursor(data.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);
    const status = data.status ?? ReportStatus.OPEN;

    const rows = await this.prisma.contentReport.findMany({
      take: take + 1,
      where: {
        ...cursorFilter,
        status,
        ...(data.targetType === ReportTargetType.POST
          ? { postId: { not: null } }
          : data.targetType === ReportTargetType.COMMENT
            ? { commentId: { not: null } }
            : {}),
      },
      orderBy: [
        { createdAt: toSortDirection(orderBy) },
        { id: toSortDirection(orderBy) },
      ],
      select: ReviewReportSelect,
    });

    return buildCursorPage(
      rows.map((row) => this.toReviewReport(row)),
      take,
    );
  }

  async dismissReport(
    reportId: number,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    this.assertCanReviewReports(currentUser);

    const data = this.parseReviewReportActionInput({ reportId });
    await this.updateReportStatus(data.reportId, ReportStatus.DISMISSED);

    return {
      message: "Report dismissed successfully",
    };
  }

  async actionReport(
    reportId: number,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    this.assertCanReviewReports(currentUser);

    const data = this.parseReviewReportActionInput({ reportId });
    await this.updateReportStatus(data.reportId, ReportStatus.ACTIONED);

    return {
      message: "Report actioned successfully",
    };
  }

  // Private Helpers
  /** Parses and normalizes post-report input before report creation. */
  private parseReportPostInput(input: ReportPostCommand): ReportPostCommand {
    return parseWithBadRequest(
      reportPostCommandSchema,
      input,
      "Invalid report post input",
    );
  }

  /** Parses and normalizes comment-report input before report creation. */
  private parseReportCommentInput(
    input: ReportCommentCommand,
  ): ReportCommentCommand {
    return parseWithBadRequest(
      reportCommentCommandSchema,
      input,
      "Invalid report comment input",
    );
  }

  /** Parses and normalizes moderation review list input before querying reports. */
  private parseReviewReportsInput(
    input: ReviewReportsCommand,
  ): ReviewReportsCommand {
    return parseWithBadRequest(
      reviewReportsCommandSchema,
      input,
      "Invalid review reports input",
    );
  }

  /** Parses and normalizes a moderation action targeting one report id. */
  private parseReviewReportActionInput(
    input: ReviewReportActionCommand,
  ): ReviewReportActionCommand {
    return parseWithBadRequest(
      reviewReportActionCommandSchema,
      input,
      "Invalid review report action input",
    );
  }

  /** Builds the nullable unique key used to deduplicate open post reports per reporter. */
  private buildOpenPostReportDedupKey(
    reporterId: number,
    postId: number,
  ): string {
    return `post:${postId}:reporter:${reporterId}`;
  }

  /** Builds the nullable unique key used to deduplicate open comment reports per reporter. */
  private buildOpenCommentReportDedupKey(
    reporterId: number,
    commentId: number,
  ): string {
    return `comment:${commentId}:reporter:${reporterId}`;
  }

  /** Ensures the current user can access moderator/admin report review operations. */
  private assertCanReviewReports(currentUser: AuthenticatedUser): void {
    if (!currentUser.role || !MODERATION_ROLE_SET.has(currentUser.role)) {
      throw new ForbiddenException("Forbidden resource");
    }
  }

  /** Applies one terminal moderation status transition to an open report. */
  private async updateReportStatus(
    reportId: number,
    nextStatus: ReportStatus.DISMISSED | ReportStatus.ACTIONED,
  ): Promise<void> {
    try {
      const result = await this.prisma.contentReport.updateMany({
        where: {
          id: reportId,
          status: ReportStatus.OPEN,
        },
        data: {
          status: nextStatus,
          openDedupKey: null,
        },
      });

      if (result.count === 1) {
        return;
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          throw new BadRequestException("Report status could not be updated");
        }
      }

      this.logger.error(
        `Unexpected persistence failure while trying to update report ${reportId} to ${nextStatus}`,
        err instanceof Error ? err.stack : undefined,
      );

      throw new InternalServerErrorException("Failed to update report");
    }

    const report = await this.prisma.contentReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        status: true,
      },
    });

    if (!report) {
      throw new NotFoundException("Report not found");
    }

    if ((report.status as ReportStatus) !== ReportStatus.OPEN) {
      throw new BadRequestException("Reviewed reports cannot be changed again");
    }

    this.logger.error(
      `Unexpected moderation transition mismatch for report ${reportId}`,
    );

    throw new InternalServerErrorException("Failed to update report");
  }

  /** Maps one raw report row into the safe moderation review DTO shape. */
  private toReviewReport(row: ReviewReportRow): ReviewReportDTO {
    if (row.postId !== null) {
      return {
        id: row.id,
        targetType: ReportTargetType.POST,
        targetId: row.postId,
        reason: row.reason as ReportReason,
        details: row.details,
        status: row.status as ReportStatus,
        createdAt: row.createdAt,
        reporter: row.reporter,
      };
    }

    if (row.commentId !== null) {
      return {
        id: row.id,
        targetType: ReportTargetType.COMMENT,
        targetId: row.commentId,
        reason: row.reason as ReportReason,
        details: row.details,
        status: row.status as ReportStatus,
        createdAt: row.createdAt,
        reporter: row.reporter,
      };
    }

    throw new InternalServerErrorException("Report target is invalid");
  }

  /** Maps report-persistence failures into sanitized domain-specific exceptions. */
  private throwReportPersistenceFailure(
    target: "post" | "comment",
    err: unknown,
  ): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new ConflictException(`You already reported this ${target}`);
      }

      if (err.code === "P2003" || err.code === "P2025") {
        throw new NotFoundException(
          target === "post" ? "Post not found" : "Comment not found",
        );
      }
    }

    this.logger.error(
      `Unexpected persistence failure while trying to report ${target}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to report ${target}`);
  }
}

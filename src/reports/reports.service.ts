import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { ReportReason } from "@/reports/enums/report-reason.enum";
import {
  reportPostCommandSchema,
  type ReportPostCommand,
} from "@/reports/schemas/report-post-command.schema";
import {
  reportCommentCommandSchema,
  type ReportCommentCommand,
} from "@/reports/schemas/report-comment-command.schema";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma, ReportStatus } from "@prisma/client";

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
      select: { id: true, authorId: true },
    });

    if (!post) {
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
      select: { id: true, authorId: true },
    });

    if (!comment) {
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

  private parseReportPostInput(input: ReportPostCommand): ReportPostCommand {
    return parseWithBadRequest(
      reportPostCommandSchema,
      input,
      "Invalid report post input",
    );
  }

  private parseReportCommentInput(
    input: ReportCommentCommand,
  ): ReportCommentCommand {
    return parseWithBadRequest(
      reportCommentCommandSchema,
      input,
      "Invalid report comment input",
    );
  }

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

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";
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

import {
  createCommentCommandSchema,
  type CreateCommentCommand,
} from "@/comments/schemas/create-comment.schema";
import {
  removeCommentByModeratorCommandSchema,
  type RemoveCommentByModeratorCommand,
} from "@/comments/schemas/remove-comment-by-moderator.schema";
import {
  type SafeCommentDTO,
  SafeCommentSelect,
} from "@/comments/dto/safe-comment.dto";
import {
  updateCommentCommandSchema,
  type UpdateCommentCommand,
} from "@/comments/schemas/update-comment.schema";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { MODERATION_ROLE_SET } from "@/users/enums/user-role.enum";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type FindCommentsByPostParams = {
  after?: string;
  first?: number;
  postId: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  async createComment(
    input: CreateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    const data = this.parseCreateCommentInput(input);

    const post = await this.prisma.post.findUnique({
      where: { id: data.postId },
      select: { id: true, authorId: true, removedAt: true },
    });

    if (!post || post.removedAt) throw new NotFoundException("Post not found");

    const comment = await this.prisma.$transaction(async (tx) => {
      const createdComment = await tx.comment.create({
        data: {
          content: data.content,
          postId: data.postId,
          authorId: currentUserId,
        },

        select: SafeCommentSelect,
      });

      await tx.post.update({
        where: { id: data.postId },

        data: {
          commentsCount: {
            increment: 1,
          },
        },
      });

      return createdComment;
    });

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating comment on post ${data.postId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${data.postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          `v:user:${post.authorId}:posts:list`,
        );
      },
    );

    return comment;
  }

  async findCommentsByPost({
    after,
    first,
    postId,
    orderBy,
  }: FindCommentsByPostParams): Promise<CursorPageResult<SafeCommentDTO>> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, removedAt: true },
    });

    if (!post || post.removedAt) throw new NotFoundException("Post not found");

    const normalizedTake = normalizeCursorTake(first);
    const orderby = orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = after ? decodeChronoCursor(after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    const rows = await this.prisma.comment.findMany({
      take: normalizedTake + 1,
      where: cursorFilter
        ? {
            AND: [{ postId }, { removedAt: null }, cursorFilter],
          }
        : {
            postId,
            removedAt: null,
          },
      orderBy: [
        { createdAt: toSortDirection(orderby) },
        { id: toSortDirection(orderby) },
      ],
      select: SafeCommentSelect,
    });

    return buildCursorPage(rows, normalizedTake);
  }

  async updateComment(
    commentId: number,
    input: UpdateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    const data = this.parseUpdateCommentInput(input);

    const updateData: Prisma.CommentUpdateInput = {
      content: data.content,
    };

    let updatedComment: SafeCommentDTO;
    let postId: number;

    try {
      const existing = await this.prisma.comment.findUnique({
        where: { id: commentId },

        select: {
          id: true,
          authorId: true,
          postId: true,
          removedAt: true,
        },
      });

      if (!existing || existing.removedAt) {
        throw new NotFoundException("Comment not found");
      }

      if (existing.authorId !== currentUserId) {
        throw new ForbiddenException(
          "You do not have permission to update this comment",
        );
      }

      postId = existing.postId;

      updatedComment = await this.prisma.comment.update({
        where: { id: commentId },
        data: updateData,

        select: SafeCommentSelect,
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Comment not found");
      }

      this.throwUnexpectedPersistenceFailure("update comment", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after updating comment ${commentId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${postId}`);
      },
    );

    return updatedComment;
  }

  async deleteComment(
    commentId: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },

      select: {
        id: true,
        authorId: true,
        postId: true,
        removedAt: true,
        post: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!comment || comment.removedAt) {
      throw new NotFoundException("Comment not found");
    }

    if (comment.authorId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to delete this comment",
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.comment.delete({
        where: { id: commentId },
      });

      await tx.post.update({
        where: { id: comment.postId },

        data: {
          commentsCount: {
            decrement: 1,
          },
        },
      });
    });

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting comment ${commentId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${comment.postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          `v:user:${comment.post.authorId}:posts:list`,
        );
      },
    );

    return {
      message: "Comment deleted successfully",
    };
  }

  async removeCommentByModerator(
    input: RemoveCommentByModeratorCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    this.assertCanModerateContent(currentUser);

    const data = this.parseRemoveCommentByModeratorInput(input);

    const existing = await this.prisma.comment.findUnique({
      where: { id: data.commentId },
      select: {
        id: true,
        postId: true,
        removedAt: true,
        post: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException("Comment not found");
    }

    if (existing.removedAt) {
      throw new BadRequestException("Comment has already been removed");
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const removal = await tx.comment.updateMany({
          where: {
            id: data.commentId,
            removedAt: null,
          },
          data: {
            removedAt: new Date(),
            removedById: currentUser.id,
            removalReason: data.reason,
          },
        });

        if (removal.count === 0) {
          throw new BadRequestException("Comment has already been removed");
        }

        await tx.post.update({
          where: { id: existing.postId },
          data: {
            commentsCount: {
              decrement: 1,
            },
          },
        });

        if (data.reportId !== undefined) {
          const linkedReport = await tx.contentReport.updateMany({
            where: {
              id: data.reportId,
              commentId: data.commentId,
              status: "OPEN",
            },
            data: {
              status: "ACTIONED",
            },
          });

          if (linkedReport.count === 0) {
            throw new BadRequestException(
              "Linked report is not open for this comment",
            );
          }
        }

        await tx.moderationAction.create({
          data: {
            actorId: currentUser.id,
            actionType: "REMOVE_COMMENT",
            targetType: "COMMENT",
            targetId: data.commentId,
            reason: data.reason,
            reportId: data.reportId,
            commentId: data.commentId,
          },
        });
      });
    } catch (err) {
      if (err instanceof HttpException) throw err;

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Comment not found");
      }

      this.throwUnexpectedPersistenceFailure(
        "remove comment by moderator",
        err,
      );
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after moderator removed comment ${data.commentId}`,
      async () => {
        await this.cacheHelper.del(`posts:detail:${existing.postId}`);
        await this.cacheHelper.bumpVersion("v:posts:list");
        await this.cacheHelper.bumpVersion(
          `v:user:${existing.post.authorId}:posts:list`,
        );
      },
    );

    return {
      message: "Comment removed successfully",
    };
  }

  // Private Helpers
  /** Parses and normalizes create-comment input with Zod, throws BadRequest on error. */
  private parseCreateCommentInput(input: CreateCommentCommand) {
    return parseWithBadRequest(
      createCommentCommandSchema,
      input,
      "Invalid comment input",
    );
  }

  /** Parses and normalizes update-comment input with Zod, throws BadRequest on error. */
  private parseUpdateCommentInput(input: UpdateCommentCommand) {
    return parseWithBadRequest(
      updateCommentCommandSchema,
      input,
      "Invalid comment input",
    );
  }

  /** Parses and normalizes moderator/admin comment-removal input with Zod. */
  private parseRemoveCommentByModeratorInput(
    input: RemoveCommentByModeratorCommand,
  ) {
    return parseWithBadRequest(
      removeCommentByModeratorCommandSchema,
      input,
      "Invalid moderator comment removal input",
    );
  }

  /** Enforces that only moderators/admins can perform moderation actions. */
  private assertCanModerateContent(user: AuthenticatedUser): void {
    if (!user.role || !MODERATION_ROLE_SET.has(user.role)) {
      throw new ForbiddenException(
        "You do not have permission to moderate content",
      );
    }
  }

  /** Logs and throws InternalServerErrorException for unexpected persistence errors. */
  private throwUnexpectedPersistenceFailure(
    action: "update comment" | "remove comment by moderator",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}

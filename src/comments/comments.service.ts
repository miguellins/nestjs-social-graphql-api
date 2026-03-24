import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { createCommentCommandSchema } from "@/comments/schemas/create-comment.schema";
import type { CreateCommentCommand } from "@/comments/schemas/create-comment.schema";
import type { SafeCommentDTO } from "@/comments/dto/safe-comment.dto";
import { SafeCommentSelect } from "@/comments/dto/safe-comment.dto";
import {
  updateCommentCommandSchema,
  type UpdateCommentCommand,
} from "@/comments/schemas/update-comment.schema";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { PrismaService } from "@/prisma.service";
import { Prisma } from "@prisma/client";

/**
 * Service for comment workflows
 *
 * Creates, lists, updates, and deletes comments
 */

type FindCommentsByPostParams = {
  postId: number;
  take?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  // Injects the services used by comment workflows
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  // Creates a comment and updates the related post counter
  async createComment(
    input: CreateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    const data = this.parseCreateCommentInput(input);

    // Check if the target post exists before creating the comment
    const post = await this.prisma.post.findUnique({
      where: { id: data.postId },
      select: { id: true, authorId: true },
    });

    if (!post) throw new NotFoundException("Post not found");

    // Keep the comment creation and commentsCount increment in sync
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

    // Keep cache refresh failures from masking a committed comment creation
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

  // Lists comments for a post with bounded pagination
  async findCommentsByPost({
    postId,
    take,
    orderBy,
  }: FindCommentsByPostParams): Promise<SafeCommentDTO[]> {
    // Check if the post exists before listing comments
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!post) throw new NotFoundException("Post not found");

    // Limit how many comments can be returned
    const normalizedTake = Math.min(
      take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Default to newest-first when no explicit chronological order is provided
    const orderby = orderBy ?? ChronologicalOrder.NEWEST;

    return this.prisma.comment.findMany({
      take: normalizedTake,
      where: {
        postId,
      },

      orderBy: {
        createdAt: toSortDirection(orderby),
      },

      select: SafeCommentSelect,
    });
  }

  // Updates a comment owned by the current user
  async updateComment(
    commentId: number,
    input: UpdateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    const data = this.parseUpdateCommentInput(input);

    // Build update payload safely
    const updateData: Prisma.CommentUpdateInput = {
      content: data.content,
    };

    // Store the updated comment outside the try block so follow-up cache work can reuse it
    let updatedComment: SafeCommentDTO;
    let postId: number;

    try {
      // Fetch minimal fields needed for ownership + existence
      const existing = await this.prisma.comment.findUnique({
        where: { id: commentId },

        select: {
          id: true,
          authorId: true,
          postId: true,
        },
      });

      if (!existing) throw new NotFoundException("Comment not found");

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

    // Keep cache refresh failures from masking a committed comment update
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

  // Deletes a comment owned by the current user
  async deleteComment(
    commentId: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    // Find the comment to validate ownership and know which post to update
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },

      select: {
        id: true,
        authorId: true,
        postId: true,
        post: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!comment) throw new NotFoundException("Comment not found");

    // Only the comment owner can delete it
    if (comment.authorId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to delete this comment",
      );
    }

    // Keep the comment deletion and commentsCount decrement in sync
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

    // Keep cache refresh failures from masking a committed comment deletion
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

  // Parses and normalizes create-comment input for the service layer
  private parseCreateCommentInput(input: CreateCommentCommand) {
    return parseWithBadRequest(
      createCommentCommandSchema,
      input,
      "Invalid comment input",
    );
  }

  // Parses and normalizes update-comment input for the service layer
  private parseUpdateCommentInput(input: UpdateCommentCommand) {
    return parseWithBadRequest(
      updateCommentCommandSchema,
      input,
      "Invalid comment input",
    );
  }

  private throwUnexpectedPersistenceFailure(
    action: "update comment",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}

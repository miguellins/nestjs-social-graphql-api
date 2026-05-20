import {
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { MessageResponse } from "@/common/types/message-response.type";
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";
import { runBestEffort } from "@/common/errors/run-best-effort";

import { CommentCacheService } from "@/comments/comment-cache.service";
import { CommentCreateService } from "@/comments/comment-create.service";
import { CommentGuardsService } from "@/comments/comment-guards.service";

import {
  type SafeCommentDTO,
  type SafeCommentRecord,
  SafeCommentSelect,
} from "@/comments/dto/safe-comment.dto";
import { type CreateCommentCommand } from "@/comments/schemas/create-comment.schema";
import {
  updateCommentCommandSchema,
  type UpdateCommentCommand,
} from "@/comments/schemas/update-comment.schema";

import { MentionsService } from "@/mentions/mentions.service";

import { Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class CommentWriteService {
  private readonly logger = new Logger(CommentWriteService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly commentCreateService: CommentCreateService,
    private readonly commentCacheService: CommentCacheService,
    private readonly commentGuardsService: CommentGuardsService,
    private readonly mentionsService: MentionsService,
  ) {}

  /** Delegates comment creation to the create collaborator. */
  async createComment(
    input: CreateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    return this.commentCreateService.createComment(input, currentUserId);
  }

  async deleteComment(
    commentId: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    await this.commentGuardsService.assertActiveCurrentUserById(currentUserId);
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },

      select: {
        id: true,
        authorId: true,
        postId: true,
        parentCommentId: true,
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

    try {
      await this.prisma.$transaction(async (tx) => {
        const deletedReplies =
          comment.parentCommentId === null
            ? await tx.comment.deleteMany({
                where: {
                  parentCommentId: commentId,
                  removedAt: null,
                },
              })
            : { count: 0 };

        await tx.comment.delete({
          where: { id: commentId },
        });

        await tx.post.update({
          where: { id: comment.postId },

          data: {
            commentsCount: {
              decrement: deletedReplies.count + 1,
            },
          },
        });
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Comment not found");
      }

      this.throwUnexpectedPersistenceFailure("delete comment", err);
    }

    await this.commentCacheService.invalidateAfterDeleteComment(
      commentId,
      comment.postId,
      comment.post.authorId,
    );

    return {
      message: "Comment deleted successfully",
    };
  }

  async updateComment(
    commentId: number,
    input: UpdateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    await this.commentGuardsService.assertActiveCurrentUserById(currentUserId);
    const data = this.parseUpdateCommentInput(input);
    this.mentionsService.validateCommentContentMentions(data.content);

    const updateData: Prisma.CommentUpdateInput = {
      content: data.content,
    };

    let updatedComment: SafeCommentRecord;
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

    await this.commentCacheService.invalidateAfterUpdateComment(
      commentId,
      postId,
    );

    await runBestEffort(
      this.logger,
      "error",
      `Failed to sync mentions after updating comment ${commentId}`,
      async () => {
        await this.mentionsService.syncCommentMentions({
          commentId,
          actorId: currentUserId,
          content: data.content,
        });
      },
    );

    return this.toCommentMutationResult(updatedComment);
  }

  // Private Helpers
  /** Parses and normalizes update-comment input with Zod, throws BadRequest on error. */
  private parseUpdateCommentInput(input: UpdateCommentCommand) {
    return parseWithBadRequest(
      updateCommentCommandSchema,
      input,
      "Invalid comment input",
    );
  }

  /** Logs and throws InternalServerErrorException for unexpected persistence errors. */
  private throwUnexpectedPersistenceFailure(
    action: "update comment" | "delete comment",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  /** Shapes one flat safe comment record into the mutation response contract used by GraphQL. */
  private toCommentMutationResult(comment: SafeCommentRecord): SafeCommentDTO {
    return {
      ...comment,
      repliesCount: 0,
      replies: [],
    };
  }
}

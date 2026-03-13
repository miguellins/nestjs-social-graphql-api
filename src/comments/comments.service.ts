import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { DeleteResponse } from "@/common/types/delete-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";

import { PrismaService } from "@/prisma.service";

import { type CreateCommentInput } from "@/comments/dto/create-comment.input";
import {
  SafeCommentSelect,
  type SafeCommentDTO,
} from "@/comments/dto/safe-comment.dto";

type FindCommentsByPostParams = {
  postId: number;
  take?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  async createComment(
    input: CreateCommentInput,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    // Check if the target post exists before creating the comment
    const post = await this.prisma.post.findUnique({
      where: { id: input.postId },
      select: { id: true },
    });

    if (!post) throw new NotFoundException("Post not found");

    // Keep the comment creation and commentsCount increment in sync
    const comment = await this.prisma.$transaction(async (tx) => {
      const createdComment = await tx.comment.create({
        data: {
          content: input.content,
          postId: input.postId,
          authorId: currentUserId,
        },

        select: SafeCommentSelect,
      });

      await tx.post.update({
        where: { id: input.postId },

        data: {
          commentsCount: {
            increment: 1,
          },
        },
      });

      return createdComment;
    });

    // Invalidate the cached post detail because comments changed
    await this.cacheHelper.del(`posts:detail:${input.postId}`);

    return comment;
  }

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

  async deleteComment(
    commentId: number,
    currentUserId: number,
  ): Promise<DeleteResponse> {
    // Find the comment to validate ownership and know which post to update
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },

      select: {
        id: true,
        authorId: true,
        postId: true,
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

    // Invalidate the cached post detail because comments changed
    await this.cacheHelper.del(`posts:detail:${comment.postId}`);

    return {
      message: "Comment deleted successfully",
    };
  }
}

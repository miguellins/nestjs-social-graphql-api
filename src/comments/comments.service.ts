import { Injectable } from "@nestjs/common";

import { type CursorPageResult } from "@/common/pagination/cursor-pagination";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { MessageResponse } from "@/common/types/message-response.type";

import { CommentModerationService } from "@/comments/comment-moderation.service";
import { CommentWriteService } from "@/comments/comment-write.service";
import { CommentsReadService } from "@/comments/comments-read.service";
import { type SafeCommentDTO } from "@/comments/dto/safe-comment.dto";
import { type CreateCommentCommand } from "@/comments/schemas/create-comment.schema";
import { type RemoveCommentByModeratorCommand } from "@/comments/schemas/remove-comment-by-moderator.schema";
import { type UpdateCommentCommand } from "@/comments/schemas/update-comment.schema";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

type FindCommentsByPostParams = {
  after?: string;
  first?: number;
  postId: number;
  orderBy?: ChronologicalOrder;
  viewerId?: number;
};

@Injectable()
export class CommentsService {
  constructor(
    private readonly commentWriteService: CommentWriteService,
    private readonly commentModerationService: CommentModerationService,
    private readonly commentsReadService: CommentsReadService,
  ) {}

  /** Delegates comment creation to the write collaborator. */
  async createComment(
    input: CreateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    return this.commentWriteService.createComment(input, currentUserId);
  }

  /** Delegates post comment reads to the read collaborator. */
  async findCommentsByPost({
    after,
    first,
    postId,
    orderBy,
    viewerId,
  }: FindCommentsByPostParams): Promise<CursorPageResult<SafeCommentDTO>> {
    return this.commentsReadService.findCommentsByPost({
      after,
      first,
      postId,
      orderBy,
      viewerId,
    });
  }

  /** Delegates comment updates to the write collaborator. */
  async updateComment(
    commentId: number,
    input: UpdateCommentCommand,
    currentUserId: number,
  ): Promise<SafeCommentDTO> {
    return this.commentWriteService.updateComment(
      commentId,
      input,
      currentUserId,
    );
  }

  /** Delegates comment deletion to the write collaborator. */
  async deleteComment(
    commentId: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    return this.commentWriteService.deleteComment(commentId, currentUserId);
  }

  /** Delegates moderator comment removal to the moderation collaborator. */
  async removeCommentByModerator(
    input: RemoveCommentByModeratorCommand,
    currentUser: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.commentModerationService.removeCommentByModerator(
      input,
      currentUser,
    );
  }
}

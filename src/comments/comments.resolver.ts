import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { RemoveCommentByModeratorInput } from "@/comments/dto/remove-comment-by-moderator.input";
import { FindCommentsByPostArgs } from "@/comments/args/find-comments-by-post.args";
import { CreateCommentInput } from "@/comments/dto/create-comment.input";
import { UpdateCommentInput } from "@/comments/dto/update-comment.input";
import { CommentPage } from "@/comments/models/comment-page.model";
import { CommentsService } from "@/comments/comments.service";
import { Comment } from "@/comments/models/comment.model";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public, Roles } from "@/common/decorators/auth.decorator";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { MODERATION_ROLES } from "@/users/enums/user-role.enum";

@Resolver(() => Comment)
export class CommentsResolver {
  constructor(private readonly commentsService: CommentsService) {}

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Comment, { name: "createComment" })
  async createComment(
    @Args("input") input: CreateCommentInput,
    @CurrentUser() user: { id: number },
  ): Promise<Comment> {
    return this.commentsService.createComment(input, user.id);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => CommentPage, { name: "commentsByPost" })
  async commentsByPost(
    @Args() args: FindCommentsByPostArgs,
  ): Promise<CommentPage> {
    return this.commentsService.findCommentsByPost({
      postId: args.postId,
      first: args.first,
      after: args.after,
      orderBy: args.orderBy,
    });
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Comment, { name: "updateComment" })
  async updateComment(
    @Args("commentId", { type: () => Int }) commentId: number,
    @Args("input") input: UpdateCommentInput,
    @CurrentUser() user: { id: number },
  ): Promise<Comment> {
    return this.commentsService.updateComment(commentId, input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => MessageResponse, { name: "deleteComment" })
  async deleteComment(
    @Args("commentId", { type: () => Int }) commentId: number,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.commentsService.deleteComment(commentId, user.id);
  }

  @Roles(...MODERATION_ROLES)
  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => MessageResponse, { name: "removeCommentByModerator" })
  async removeCommentByModerator(
    @Args("input") input: RemoveCommentByModeratorInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MessageResponse> {
    return this.commentsService.removeCommentByModerator(input, user);
  }
}

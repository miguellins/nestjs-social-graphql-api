import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { FindCommentsByPostArgs } from "@/comments/args/find-comments-by-post.args";
import { CreateCommentInput } from "@/comments/dto/create-comment.input";
import { UpdateCommentInput } from "@/comments/dto/update-comment.input";
import { CommentPage } from "@/comments/models/comment-page.model";
import { CommentsService } from "@/comments/comments.service";
import { Comment } from "@/comments/models/comment.model";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

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
}

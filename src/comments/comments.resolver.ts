import { Args, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { FindCommentsByPostArgs } from "@/comments/args/find-comments-by-post.args";
import { CreateCommentArgs } from "@/comments/args/create-comment.args";
import { DeleteCommentArgs } from "@/comments/args/delete-comment.args";
import { SafeCommentDTO } from "@/comments/models/safe-comment.model";
import { CommentsService } from "@/comments/comments.service";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { DeleteResponse } from "@/common/types/delete-response.type";

/**
 * GraphQL resolver for comments
 *
 * Exposes comment queries and mutations
 */

@Resolver(() => SafeCommentDTO)
export class CommentsResolver {
  constructor(private readonly commentsService: CommentsService) {}

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => SafeCommentDTO, { name: "createComment" })
  async createComment(
    @Args() args: CreateCommentArgs,
    @CurrentUser() user: { id: number },
  ): Promise<SafeCommentDTO> {
    return this.commentsService.createComment(args.input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [SafeCommentDTO], { name: "commentsByPost" })
  async commentsByPost(
    @Args() args: FindCommentsByPostArgs,
  ): Promise<SafeCommentDTO[]> {
    return this.commentsService.findCommentsByPost({
      postId: args.postId,
      take: args.take,
    });
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => DeleteResponse, { name: "deleteComment" })
  async deleteComment(
    @Args() args: DeleteCommentArgs,
    @CurrentUser() user: { id: number },
  ): Promise<DeleteResponse> {
    return this.commentsService.deleteComment(args.commentId, user.id);
  }
}

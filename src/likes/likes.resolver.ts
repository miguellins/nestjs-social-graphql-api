import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

import { LikeListItem } from "@/likes/models/like-list-item.model";
import { FindLikesArgs } from "@/likes/args/find-likes.args";
import { LikePage } from "@/likes/models/like-page.model";
import { LikesService } from "@/likes/likes.service";
import { Like } from "@/likes/models/like.model";

@Resolver(() => Like)
export class LikeResolver {
  constructor(private readonly likesService: LikesService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => LikePage, { name: "likes" })
  async likes(@Args() args: FindLikesArgs): Promise<LikePage> {
    return this.likesService.findLikes(args);
  }

  @Public()
  @Query(() => LikeListItem, { name: "likeById" })
  @Throttle({ default: THROTTLE_LIMITS.READ })
  async likeById(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<LikeListItem> {
    return this.likesService.getLike(id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => LikeListItem, { name: "createLike" })
  async createLike(
    @Args("postId", { type: () => Int }) postId: number,
    @CurrentUser() user: { id: number },
  ): Promise<LikeListItem> {
    return this.likesService.createLike(user.id, postId);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => MessageResponse, { name: "deleteLike" })
  async deleteLike(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.likesService.deleteLike(id, user.id);
  }
}

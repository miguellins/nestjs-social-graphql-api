import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "src/common/decorators/current-user.decorator";
import { Public } from "src/common/decorators/auth.decorator";

import { THROTTLE_LIMITS } from "src/common/constants/throttle.constants";

import { DeleteResponse } from "src/common/types/delete-response.type";

import { FindLikesArgs } from "src/common/args/find-likes.args";

import { LikeListItem } from "./models/like-list-item.model";
import { Like } from "./models/likes.model";

import { LikesService } from "./likes.service";

@Resolver(() => Like)
export class LikeResolver {
  constructor(private readonly likesService: LikesService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [LikeListItem])
  async likes(@Args() args: FindLikesArgs): Promise<LikeListItem[]> {
    return this.likesService.findLikes(args);
  }

  @Public()
  @Query(() => LikeListItem)
  @Throttle({ default: THROTTLE_LIMITS.READ })
  async likeById(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<LikeListItem> {
    return this.likesService.getLike(id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => LikeListItem)
  async createLike(
    @Args("postId", { type: () => Int }) postId: number,
    @CurrentUser() user: { id: number },
  ): Promise<LikeListItem> {
    return this.likesService.createLike(user.id, postId);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => DeleteResponse)
  async deleteLike(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<DeleteResponse> {
    await this.likesService.deleteLike(id, user.id);

    return {
      message: "Like deleted successfully",
    };
  }
}

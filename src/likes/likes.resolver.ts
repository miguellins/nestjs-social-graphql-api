import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "src/common/decorators/current-user.decorator";

import { DeleteResponse } from "src/common/types/delete-response.type";

import { Public } from "src/common/decorators/auth.decorator";

import { LikesService } from "./likes.service";
import { Like } from "./likes.model";

@Resolver(() => Like)
export class LikeResolver {
  constructor(private readonly likesService: LikesService) {}

  @Public()
  @Query(() => [Like])
  async likes() {
    return this.likesService.getAllLikes();
  }

  @Public()
  @Query(() => Like)
  async like(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<Like | null> {
    return this.likesService.getLike(id);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Like)
  async createLike(
    @Args("postId", { type: () => Int }) postId: number,
    @CurrentUser() user: { id: number },
  ) {
    return this.likesService.createLike(user.id, postId);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => DeleteResponse)
  async deleteLike(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user,
  ): Promise<DeleteResponse> {
    await this.likesService.deleteLike(id, user.id);

    return {
      message: "Like deleted successfully",
    };
  }
}

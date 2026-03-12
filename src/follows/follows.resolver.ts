import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/auth.decorator";

import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";

import { DeleteResponse } from "@/common/types/delete-response.type";

import { FollowsService } from "@/follows/follows.service";

import { Follow } from "@/follows/models/follows.model";

@Resolver(() => Follow)
export class FollowsResolver {
  constructor(private readonly followsService: FollowsService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [Follow], { name: "follows" })
  async follows(
    @Args("take", { type: () => Int, nullable: true }) take?: number,
  ): Promise<Follow[]> {
    return this.followsService.findFollows({ take });
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => Follow, { name: "followById" })
  async followById(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<Follow> {
    return this.followsService.getFollow(id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Follow, { name: "createFollow" })
  async createFollow(
    @Args("followingId", { type: () => Int }) followingId: number,
    @CurrentUser() user: { id: number },
  ): Promise<Follow> {
    return this.followsService.createFollow(user.id, followingId);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => DeleteResponse, { name: "deleteFollow" })
  async deleteFollow(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<DeleteResponse> {
    return this.followsService.deleteFollow(id, user.id);
  }
}

import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

import { FindFollowsArgs } from "@/follows/args/find-follows.args";
import { FollowsService } from "@/follows/follows.service";
import { Follow } from "@/follows/models/follows.model";

/**
 * GraphQL resolver for follows
 *
 * Exposes follow queries and mutations
 */

@Resolver(() => Follow)
export class FollowsResolver {
  constructor(private readonly followsService: FollowsService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [Follow], { name: "follows" })
  async follows(@Args() args: FindFollowsArgs): Promise<Follow[]> {
    return this.followsService.findFollows(args);
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
  @Mutation(() => MessageResponse, { name: "deleteFollow" })
  async deleteFollow(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.followsService.deleteFollow(id, user.id);
  }
}

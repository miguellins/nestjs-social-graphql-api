import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

import { FollowRequestPage } from "@/follows/models/follow-request-page.model";
import { FollowUserResult } from "@/follows/models/follow-user-result.model";
import { FollowRequest } from "@/follows/models/follow-request.model";
import { FindFollowsArgs } from "@/follows/args/find-follows.args";
import { FollowPage } from "@/follows/models/follow-page.model";
import { FollowsService } from "@/follows/follows.service";
import { Follow } from "@/follows/models/follow.model";

@Resolver(() => Follow)
export class FollowsResolver {
  constructor(private readonly followsService: FollowsService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => FollowPage, { name: "follows" })
  async follows(@Args() args: FindFollowsArgs): Promise<FollowPage> {
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
  @Mutation(() => FollowUserResult, { name: "followUser" })
  async followUser(
    @Args("userId", { type: () => Int }) userId: number,
    @CurrentUser() user: { id: number },
  ): Promise<FollowUserResult> {
    return this.followsService.followUser(user.id, userId);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => FollowRequestPage, { name: "myIncomingFollowRequests" })
  async myIncomingFollowRequests(
    @Args() args: CursorPaginationArgs,
    @CurrentUser() user: { id: number },
  ): Promise<FollowRequestPage> {
    return this.followsService.findIncomingFollowRequests(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => FollowRequestPage, { name: "myOutgoingFollowRequests" })
  async myOutgoingFollowRequests(
    @Args() args: CursorPaginationArgs,
    @CurrentUser() user: { id: number },
  ): Promise<FollowRequestPage> {
    return this.followsService.findOutgoingFollowRequests(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => FollowRequest, { name: "approveFollowRequest" })
  async approveFollowRequest(
    @Args("requestId", { type: () => Int }) requestId: number,
    @CurrentUser() user: { id: number },
  ): Promise<FollowRequest> {
    return this.followsService.approveFollowRequest(requestId, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => FollowRequest, { name: "rejectFollowRequest" })
  async rejectFollowRequest(
    @Args("requestId", { type: () => Int }) requestId: number,
    @CurrentUser() user: { id: number },
  ): Promise<FollowRequest> {
    return this.followsService.rejectFollowRequest(requestId, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => FollowRequest, { name: "cancelFollowRequest" })
  async cancelFollowRequest(
    @Args("requestId", { type: () => Int }) requestId: number,
    @CurrentUser() user: { id: number },
  ): Promise<FollowRequest> {
    return this.followsService.cancelFollowRequest(requestId, user.id);
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

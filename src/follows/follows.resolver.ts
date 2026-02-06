import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { FollowsService } from "./follows.service";
import { Follow } from "./follows.model";

import { Public } from "src/decorators/auth.decorator";
import { CurrentUser } from "src/decorators/current-user.decorator";

@Resolver(() => Follow)
export class FollowsResolver {
  constructor(private readonly followsService: FollowsService) {}

  @Public()
  @Query(() => [Follow])
  async follows(): Promise<Follow[]> {
    return this.followsService.getAllFollows();
  }

  @Public()
  @Query(() => Follow)
  async follow(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<Follow | null> {
    return this.followsService.getFollow(id);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Follow)
  async createFollow(
    @Args("followingId", { type: () => Int }) followingId: number,
    @CurrentUser() user: { id: number },
  ) {
    return this.followsService.createFollow(user.id, followingId);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Boolean)
  async deleteFollow(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<boolean> {
    await this.followsService.deleteFollow(id, user.id);
    return true;
  }
}

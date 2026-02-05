import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CreateFollowInput } from "./dto/create-follow.input";
import { UpdateFollowInput } from "./dto/update-follow.input";

import { FollowsService } from "./follows.service";
import { Follow } from "./follows.model";

import { Public } from "src/auth/auth.decorator";

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
  async createFollow(@Args("input") input: CreateFollowInput) {
    return this.followsService.createFollow(input);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Follow)
  async updateFollow(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdateFollowInput,
  ): Promise<Follow> {
    return this.followsService.updateFollow(id, input);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Boolean)
  async deleteFollow(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<boolean> {
    await this.followsService.deleteFollow(id);
    return true;
  }
}

import { Resolver, Mutation, Query, Args, Int } from "@nestjs/graphql";

import { CreateFollowInput } from "./dto/create-follow.input";
import { UpdateFollowInput } from "./dto/update-follow.input";

import { FollowsService } from "./follows.service";
import { Follow } from "./follows.model";

@Resolver(() => Follow)
export class FollowsResolver {
  constructor(private readonly followsService: FollowsService) { }

  @Query(() => [Follow])
  async follows(): Promise<Follow[]> {
    return this.followsService.getAllFollows();
  }

  @Query(() => Follow)
  async follow(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<Follow | null> {
    return this.followsService.getFollow(id);
  }

  @Mutation(() => Follow)
  async createFollow(@Args("input") input: CreateFollowInput) {
    return this.followsService.createFollow(input);
  }

  /*
  @Mutation(() => User)
  async updateUser(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdateUserInput,
  ): Promise<User> {
    return this.usersService.updateUser(id, input);
  }

  @Mutation(() => Boolean)
  async deleteUser(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<boolean> {
    await this.usersService.deleteUser(id);
    return true;
  }
    */
}

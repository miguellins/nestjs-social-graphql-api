import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "src/decorators/current-user.decorator";
import { Public } from "src/decorators/auth.decorator";

import { CreateLikeInput } from "./dto/create-like.input";

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
    @Args("input") input: CreateLikeInput,
    @CurrentUser() user: { id: number },
  ) {
    return this.likesService.createLike(user.id, input.postId);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Boolean)
  async deleteLike(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user,
  ): Promise<boolean> {
    await this.likesService.deleteLike(id, user.id);
    return true;
  }
}

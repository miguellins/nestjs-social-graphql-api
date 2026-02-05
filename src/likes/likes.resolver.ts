import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CreateLikeInput } from "./dto/create-like.input";
import { UpdateLikeInput } from "./dto/update-like.input";

import { LikesService } from "./likes.service";
import { Like } from "./likes.model";

import { Public } from "src/auth/auth.decorator";

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
  async createLike(@Args("input") input: CreateLikeInput) {
    return this.likesService.createLike(input);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Like)
  async updateLike(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdateLikeInput,
  ): Promise<Like> {
    return this.likesService.updateLike(id, input);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Boolean)
  async deleteLike(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<boolean> {
    await this.likesService.deleteLike(id);
    return true;
  }
}

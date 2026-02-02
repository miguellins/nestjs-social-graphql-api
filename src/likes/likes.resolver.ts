import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";

import { CreateLikeInput } from "./dto/create-like.input";
import { UpdateLikeInput } from "./dto/update-like.input";

import { LikesService } from "./likes.service";
import { Like } from "./likes.model";

@Resolver(() => Like)
export class LikeResolver {
  constructor(private readonly likesService: LikesService) {}

  @Query(() => [Like])
  async likes() {
    return this.likesService.getAllLikes();
  }

  @Query(() => Like)
  async like(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<Like | null> {
    return this.likesService.getLike(id);
  }

  @Mutation(() => Like)
  async createLike(@Args("input") input: CreateLikeInput) {
    return this.likesService.createLike(input);
  }

  @Mutation(() => Like)
  async updateLike(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdateLikeInput,
  ): Promise<Like> {
    return this.likesService.updateLike(id, input);
  }

  @Mutation(() => Boolean)
  async deleteLike(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<boolean> {
    await this.likesService.deleteLike(id);
    return true;
  }
}

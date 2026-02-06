import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CreatePostInput } from "./dto/create-post.input";
import { UpdatePostInput } from "./dto/update-post.input";

import { PostsService } from "./posts.service";
import { Post } from "./posts.model";

import { Public } from "src/decorators/auth.decorator";
import { CurrentUser } from "src/decorators/current-user.decorator";
import { DeleteResponse } from "src/delete-response.type";

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Query(() => [Post])
  async posts() {
    return this.postsService.getAllPosts();
  }

  @Public()
  @Query(() => Post)
  async post(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<Post | null> {
    return this.postsService.getPost(id);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Post)
  async createPost(
    @Args("input") input: CreatePostInput,
    @CurrentUser() user: { id: number },
  ) {
    return this.postsService.createPost(input, user.id);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => Post)
  async updatePost(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdatePostInput,
    @CurrentUser() user: { id: number },
  ): Promise<Post> {
    return this.postsService.updatePost(id, input, user.id);
  }

  @Throttle({ default: { ttl: 10, limit: 2 } })
  @Mutation(() => DeleteResponse)
  async deletePost(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<DeleteResponse> {
    await this.postsService.deletePost(id, user.id);

    return {
      message: "Post deleted successfully",
    };
  }
}

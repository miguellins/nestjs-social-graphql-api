import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";

import { CreatePostInput } from "./dto/create-post.input";
import { UpdatePostInput } from "./dto/update-post.input";

import { PostsService } from "./posts.service";
import { Post } from "./posts.model";

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Query(() => [Post])
  async posts() {
    return this.postsService.findAll();
  }

  @Mutation(() => Post)
  async createPost(@Args("input") input: CreatePostInput) {
    return this.postsService.createPost(input);
  }

  @Mutation(() => Post)
  async updatePost(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdatePostInput,
  ): Promise<Post> {
    return this.postsService.updatePost(id, input);
  }
}

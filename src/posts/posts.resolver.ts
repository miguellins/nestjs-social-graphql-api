import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";

import { CreatePostInput } from "./dto/create-post.input";

import { PostsService } from "./posts.service";
import { Post } from "./posts.model";

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Query(() => [Post])
  posts() {
    return this.postsService.findAll();
  }

  @Mutation(() => Post)
  createPost(@Args("input") input: CreatePostInput) {
    return this.postsService.createPost(input);
  }
}

import { Resolver, Query, Mutation, Args } from "@nestjs/graphql";

import { PrismaService } from "../prisma.service";

import { CreatePostInput } from "./dto/create-post.input";

import { PostsService } from "./posts.service";
import { Post } from "./posts.model";

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly prisma: PrismaService, private postsService: PostsService) { }

  @Query(() => [Post])
  posts() {
    return this.prisma.post.findMany({
      include: { author: true },
    });
  }

  @Mutation(() => Post)
  createPost(@Args("input") input: CreatePostInput) {
    return this.postsService.createPost(input);
  }
}
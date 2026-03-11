import { Resolver, Query, Mutation, Args, Int } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { DeleteResponse } from "@/common/types/delete-response.type";
import { PaginationArgs } from "@/common/args/pagination.args";
import { FindPostsArgs } from "@/posts/args/find-posts.args";
import { Public } from "@/common/decorators/auth.decorator";

import { CreatePostInput } from "@/posts/dto/create-post.input";
import { UpdatePostInput } from "@/posts/dto/update-post.input";

import { PostsService } from "@/posts/posts.service";

import { PostListItem } from "@/posts/models/post-list-item.model";
import { PostDetail } from "@/posts/models/post-detail.model";
import { Post } from "@/posts/models/posts.model";

/**
 * Responsible for resolving fields of the Post GraphQL type
 */

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [PostListItem], { name: "posts" })
  async posts(@Args() args: FindPostsArgs): Promise<PostListItem[]> {
    return this.postsService.findPosts(args);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.READ })
  @Query(() => PostDetail, { name: "postById" })
  async postById(
    @Args("id", { type: () => Int }) id: number,
  ): Promise<PostDetail> {
    return this.postsService.getPost(id);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [PostListItem], { name: "myFeed" })
  async myFeed(
    @CurrentUser() user: { id: number },
    @Args() args: PaginationArgs,
  ): Promise<PostListItem[]> {
    return this.postsService.myFeed(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Post, { name: "createPost" })
  async createPost(
    @Args("input") input: CreatePostInput,
    @CurrentUser() user: { id: number },
  ): Promise<Post> {
    return this.postsService.createPost(input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Post, { name: "updatePost" })
  async updatePost(
    @Args("id", { type: () => Int }) id: number,
    @Args("input") input: UpdatePostInput,
    @CurrentUser() user: { id: number },
  ): Promise<Post> {
    return this.postsService.updatePost(id, input, user.id);
  }

  @Throttle({ default: THROTTLE_LIMITS.DESTRUCTIVE })
  @Mutation(() => DeleteResponse, { name: "deletePost" })
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

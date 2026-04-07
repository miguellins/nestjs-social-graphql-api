import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CursorPaginationArgs } from "@/common/args/cursor-pagination.args";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";
import { Public } from "@/common/decorators/auth.decorator";

import { FindPostsByUsernameArgs } from "@/posts/args/find-posts-by-username.args";
import { CreatedPost } from "@/posts/models/created-post.model";
import { CreatePostInput } from "@/posts/dto/create-post.input";
import { UpdatePostInput } from "@/posts/dto/update-post.input";
import { PostDetail } from "@/posts/models/post-detail.model";
import { FindPostsArgs } from "@/posts/args/find-posts.args";
import { PostPage } from "@/posts/models/post-page.model";
import { PostsService } from "@/posts/posts.service";
import { Post } from "@/posts/models/post.model";

@Resolver(() => Post)
export class PostsResolver {
  constructor(private readonly postsService: PostsService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => PostPage, { name: "posts" })
  async posts(@Args() args: FindPostsArgs): Promise<PostPage> {
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

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => PostPage, { name: "postsByUsername" })
  async postsByUsername(
    @Args() args: FindPostsByUsernameArgs,
  ): Promise<PostPage> {
    return this.postsService.findPostsByUsername(args.username, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => PostPage, { name: "myFeed" })
  async myFeed(
    @CurrentUser() user: { id: number },
    @Args() args: CursorPaginationArgs,
  ): Promise<PostPage> {
    return this.postsService.myFeed(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => CreatedPost, { name: "createPost" })
  async createPost(
    @Args("input") input: CreatePostInput,
    @CurrentUser() user: { id: number },
  ): Promise<CreatedPost> {
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
  @Mutation(() => MessageResponse, { name: "deletePost" })
  async deletePost(
    @Args("id", { type: () => Int }) id: number,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.postsService.deletePost(id, user.id);
  }
}

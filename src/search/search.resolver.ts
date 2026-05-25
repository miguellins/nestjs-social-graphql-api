import { Args, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { Public } from "@/common/decorators/auth.decorator";

import { SearchPostsReadService } from "@/search/search-posts-read.service";
import { SearchUsersReadService } from "@/search/search-users-read.service";
import { SearchPostsArgs } from "@/search/args/search-posts.args";
import { SearchUsersArgs } from "@/search/args/search-users.args";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { Post } from "@/posts/models/post.model";

import { SafeUser } from "@/users/models/safe-user.model";

@Resolver()
export class SearchResolver {
  constructor(
    private readonly searchPostsReadService: SearchPostsReadService,
    private readonly searchUsersReadService: SearchUsersReadService,
  ) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SEARCH })
  @Query(() => [Post], { name: "searchPosts" })
  async searchPosts(
    @Args() args: SearchPostsArgs,
    @CurrentUser() user: AuthenticatedUser | null = null,
  ): Promise<Post[]> {
    return this.searchPostsReadService.searchPosts(args, user ?? undefined);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.SEARCH })
  @Query(() => [SafeUser], { name: "searchUsers" })
  async searchUsers(
    @Args() args: SearchUsersArgs,
    @CurrentUser() user: AuthenticatedUser | null = null,
  ): Promise<SafeUser[]> {
    return this.searchUsersReadService.searchUsers(args, user ?? undefined);
  }
}

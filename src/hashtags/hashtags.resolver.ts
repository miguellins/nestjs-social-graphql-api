import { Args, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { Public } from "@/common/decorators/auth.decorator";

import { HashtagSearchResult } from "@/hashtags/models/hashtag-search-result.model";
import { PostsByHashtagArgs } from "@/hashtags/args/posts-by-hashtag.args";
import { SearchHashtagsArgs } from "@/hashtags/args/search-hashtags.args";
import { HashtagsService } from "@/hashtags/hashtags.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { PostPage } from "@/posts/models/post-page.model";

@Resolver()
export class HashtagsResolver {
  constructor(private readonly hashtagsService: HashtagsService) {}

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => PostPage, { name: "postsByHashtag" })
  async postsByHashtag(
    @Args() args: PostsByHashtagArgs,
    @CurrentUser() user: AuthenticatedUser | null = null,
  ): Promise<PostPage> {
    return this.hashtagsService.postsByHashtag(args, user ?? undefined);
  }

  @Public()
  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => [HashtagSearchResult], { name: "searchHashtags" })
  async searchHashtags(
    @Args() args: SearchHashtagsArgs,
  ): Promise<HashtagSearchResult[]> {
    return this.hashtagsService.searchHashtags(args);
  }
}

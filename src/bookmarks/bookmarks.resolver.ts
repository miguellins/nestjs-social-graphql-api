import { Args, Int, Mutation, Query, Resolver } from "@nestjs/graphql";
import { Throttle } from "@nestjs/throttler";

import { FindMyBookmarksArgs } from "@/bookmarks/args/find-my-bookmarks.args";
import { BookmarkPage } from "@/bookmarks/models/bookmark-page.model";
import { BookmarksService } from "@/bookmarks/bookmarks.service";
import { Bookmark } from "@/bookmarks/models/bookmark.model";

import { CurrentUser } from "@/common/decorators/current-user.decorator";
import { THROTTLE_LIMITS } from "@/common/constants/throttle.constants";
import { MessageResponse } from "@/common/types/message-response.type";

@Resolver(() => Bookmark)
export class BookmarksResolver {
  constructor(private readonly bookmarksService: BookmarksService) {}

  @Throttle({ default: THROTTLE_LIMITS.LIST })
  @Query(() => BookmarkPage, { name: "myBookmarks" })
  async myBookmarks(
    @Args() args: FindMyBookmarksArgs,
    @CurrentUser() user: { id: number },
  ): Promise<BookmarkPage> {
    return this.bookmarksService.findMyBookmarks(user.id, args);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => Bookmark, { name: "bookmarkPost" })
  async bookmarkPost(
    @Args("postId", { type: () => Int }) postId: number,
    @CurrentUser() user: { id: number },
  ): Promise<Bookmark> {
    return this.bookmarksService.bookmarkPost(user.id, postId);
  }

  @Throttle({ default: THROTTLE_LIMITS.MUTATION })
  @Mutation(() => MessageResponse, { name: "removeBookmark" })
  async removeBookmark(
    @Args("postId", { type: () => Int }) postId: number,
    @CurrentUser() user: { id: number },
  ): Promise<MessageResponse> {
    return this.bookmarksService.removeBookmark(user.id, postId);
  }
}

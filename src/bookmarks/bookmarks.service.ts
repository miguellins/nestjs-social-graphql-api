import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { MessageResponse } from "@/common/types/message-response.type";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { BookmarkSelect, type BookmarkDTO } from "@/bookmarks/dto/bookmark.dto";

import { PostReadService } from "@/posts/post-read.service";

import { AccountState } from "@/users/enums/account-state.enum";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type FindMyBookmarksParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class BookmarksService {
  private readonly logger = new Logger(BookmarksService.name);
  private static readonly REMOVE_BOOKMARK_SUCCESS_MESSAGE =
    "Bookmark removed successfully";

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
  ) {}

  async bookmarkPost(
    currentUserId: number,
    postId: number,
  ): Promise<BookmarkDTO> {
    await this.assertActiveCurrentUserById(currentUserId);
    await this.assertCanBookmarkPost(currentUserId, postId);

    let bookmark: BookmarkDTO;

    try {
      bookmark = await this.prisma.bookmark.create({
        data: {
          userId: currentUserId,
          postId,
        },
        select: BookmarkSelect,
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          throw new ConflictException("You already bookmarked this post");
        }

        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("Post not found");
        }
      }

      this.throwUnexpectedPersistenceFailure("bookmark post", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after bookmarking post ${postId} by user ${currentUserId}`,
      async () => {
        await this.bumpBookmarksListVersion(currentUserId);
      },
    );

    return bookmark;
  }

  async removeBookmark(
    currentUserId: number,
    postId: number,
  ): Promise<MessageResponse> {
    await this.assertActiveCurrentUserById(currentUserId);

    try {
      const result = await this.prisma.bookmark.deleteMany({
        where: {
          userId: currentUserId,
          postId,
        },
      });

      if (result.count > 0) {
        await runBestEffort(
          this.logger,
          "error",
          `Failed to invalidate caches after removing bookmark for post ${postId} by user ${currentUserId}`,
          async () => {
            await this.bumpBookmarksListVersion(currentUserId);
          },
        );
      }
    } catch (err) {
      this.throwUnexpectedPersistenceFailure("remove bookmark", err);
    }

    return {
      message: BookmarksService.REMOVE_BOOKMARK_SUCCESS_MESSAGE,
    };
  }

  async findMyBookmarks(
    currentUserId: number,
    params?: FindMyBookmarksParams,
  ): Promise<CursorPageResult<BookmarkDTO>> {
    await this.assertActiveCurrentUserById(currentUserId);

    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);
    const v = await this.cacheHelper.getVersion(
      this.getBookmarksListVersionKey(currentUserId),
    );
    const cacheKey = `user:${currentUserId}:bookmarks:list:v${v}:first=${take}:after=${params?.after ?? "none"}:order=${orderBy}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const postVisibilityFilter =
          await this.buildVisiblePostFilter(currentUserId);
        try {
          const rows = await this.prisma.bookmark.findMany({
            take: take + 1,
            where: {
              AND: [
                {
                  userId: currentUserId,
                },
                ...(cursorFilter ? [cursorFilter] : []),
                {
                  post: {
                    is: postVisibilityFilter,
                  },
                },
              ],
            },
            orderBy: [
              { createdAt: toSortDirection(orderBy) },
              { id: toSortDirection(orderBy) },
            ],
            select: BookmarkSelect,
          });

          return buildCursorPage(rows, take);
        } catch (err) {
          this.throwUnexpectedPersistenceFailure("find bookmarks", err);
        }
      },
      30_000,
    );
  }

  // Private Helpers
  private getBookmarksListVersionKey(userId: number): string {
    return `v:user:${userId}:bookmarks:list`;
  }

  /** Bumps the authenticated user's bookmark-list cache version after a write. */
  private async bumpBookmarksListVersion(userId: number): Promise<void> {
    await this.cacheHelper.bumpVersion(this.getBookmarksListVersionKey(userId));
  }

  /** Confirms that the target post is currently visible to the bookmarking user. */
  private async assertCanBookmarkPost(
    currentUserId: number,
    postId: number,
  ): Promise<void> {
    let visiblePost: { id: number } | null;

    try {
      visiblePost = await this.prisma.post.findFirst({
        where: await this.buildVisiblePostFilter(currentUserId, postId),
        select: {
          id: true,
        },
      });
    } catch (err) {
      this.throwUnexpectedPersistenceFailure("bookmark post", err);
    }

    if (!visiblePost) {
      throw new NotFoundException("Post not found");
    }
  }

  /** Builds the viewer-aware Prisma filter used to restrict bookmarkable and listable posts. */
  private async buildVisiblePostFilter(
    viewerId: number,
    postId?: number,
  ): Promise<Prisma.PostWhereInput> {
    const blockedAuthorIds =
      await this.postReadService.getBlockedAuthorIds(viewerId);
    const filters: Prisma.PostWhereInput[] = [
      {
        removedAt: null,
      },
      {
        author: {
          accountState: {
            not: AccountState.DEACTIVATED,
          },
        },
      },
      ...this.postReadService.buildViewerVisibilityFilters(viewerId),
    ];

    if (postId !== undefined) {
      filters.push({ id: postId });
    }

    if (blockedAuthorIds.length > 0) {
      filters.push({
        authorId: {
          notIn: blockedAuthorIds,
        },
      });
    }

    return filters.length === 1 ? filters[0]! : { AND: filters };
  }

  /** Enforces that only active authenticated accounts can use bookmark operations. */
  private async assertActiveCurrentUserById(
    currentUserId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: {
        accountState: true,
      },
    });

    if (!user) {
      throw new NotFoundException("Current user not found");
    }

    if (user.accountState === AccountState.SUSPENDED) {
      throw new UnauthorizedException({
        message: "This account is suspended",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new UnauthorizedException({
        message: "This account is deactivated",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }

  /** Logs and sanitizes unexpected bookmark persistence failures before they reach GraphQL. */
  private throwUnexpectedPersistenceFailure(
    action: "bookmark post" | "remove bookmark" | "find bookmarks",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(
      action === "bookmark post"
        ? "Failed to bookmark post"
        : action === "remove bookmark"
          ? "Failed to remove bookmark"
          : "Failed to find bookmarks",
    );
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import {
  buildChronologicalCursorFilter,
  buildCursorPage,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";

import { PostReadService } from "@/posts/post-read.service";
import {
  type HomeFeedItemDTO,
  HomeFeedItemSelect,
} from "@/posts/dto/home-feed-item.dto";

import { AccountState } from "@/users/enums/account-state.enum";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type HomeFeedParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class FeedReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaReadProjection: MediaReadProjectionService,
    private readonly postReadService: PostReadService,
  ) {}

  /** Returns the authenticated user's home feed with bounded chronological pagination. */
  async getHomeFeed(
    currentUserId: number,
    params?: HomeFeedParams,
  ): Promise<CursorPageResult<HomeFeedItemDTO>> {
    await this.assertActiveCurrentUserById(currentUserId);

    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);
    const blockedAuthorIds =
      await this.postReadService.getBlockedAuthorIds(currentUserId);

    const filters: Prisma.PostWhereInput[] = [
      {
        removedAt: null,
      },
      {
        author: {
          accountState: AccountState.ACTIVE,
        },
      },
      {
        OR: [
          {
            authorId: currentUserId,
          },
          {
            author: {
              followers: {
                some: {
                  followerId: currentUserId,
                },
              },
            },
          },
        ],
      },
    ];

    if (blockedAuthorIds.length > 0) {
      filters.push({
        authorId: {
          notIn: blockedAuthorIds,
        },
      });
    }

    if (cursorFilter) {
      filters.push(cursorFilter);
    }

    const rows = await this.prisma.post.findMany({
      take: take + 1,
      where: filters.length === 1 ? filters[0] : { AND: filters },
      orderBy: [
        { createdAt: toSortDirection(orderBy) },
        { id: toSortDirection(orderBy) },
      ],
      select: {
        ...HomeFeedItemSelect,
        likes: {
          ...HomeFeedItemSelect.likes,
          where: {
            userId: currentUserId,
          },
        },
        bookmarks: {
          ...HomeFeedItemSelect.bookmarks,
          where: {
            userId: currentUserId,
          },
        },
      },
    });

    const page = buildCursorPage(rows, take);

    return {
      items: page.items.map((row) =>
        this.mediaReadProjection.deriveHomeFeedItemMediaUrls(row),
      ),
      pageInfo: page.pageInfo,
    };
  }

  /** Enforces that authenticated feed reads come only from active accounts. */
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
      throw new ForbiddenException("This account is suspended");
    }

    if (user.accountState === AccountState.DEACTIVATED) {
      throw new NotFoundException("Current user not found");
    }
  }
}

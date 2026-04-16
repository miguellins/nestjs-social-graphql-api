import { Injectable, NotFoundException } from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
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

import {
  type SafePostDetailDTO,
  SafePostDetailSelect,
} from "@/posts/dto/safe-post-detail.dto";
import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";

import { CommentsReadService } from "@/comments/comments-read.service";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type PaginationParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

@Injectable()
export class PostReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly mediaReadProjection: MediaReadProjectionService,
    private readonly commentsReadService: CommentsReadService,
  ) {}

  // Returns one detailed post view with bounded likes and comments
  async getPostDetail(
    id: number,
    viewerId?: number | null,
  ): Promise<SafePostDetailDTO> {
    const likesTake = Math.min(
      PAGINATION.DEFAULT_TAKE_LIKES,
      PAGINATION.MAX_TAKE_LIKES,
    );

    const commentsTake = Math.min(PAGINATION.DEFAULT_TAKE, PAGINATION.MAX_TAKE);

    const blockedAuthorIds = viewerId
      ? await this.getBlockedAuthorIds(viewerId)
      : [];

    const post = await this.prisma.post.findFirst({
      where: {
        AND: [
          {
            id,
            removedAt: null,
            author: {
              accountState: {
                not: AccountState.DEACTIVATED,
              },
            },
          },
          ...(blockedAuthorIds.length > 0
            ? [{ authorId: { notIn: blockedAuthorIds } }]
            : []),
          ...this.buildViewerVisibilityFilters(viewerId),
        ],
      },
      select: {
        ...SafePostDetailSelect,

        likes: {
          take: likesTake,
          orderBy: {
            createdAt: "desc",
          },
          select: SafePostDetailSelect.likes.select,
        },

        comments: {
          take: commentsTake,
          where: {
            removedAt: null,
          },
          orderBy: {
            createdAt: "desc",
          },
          select: SafePostDetailSelect.comments.select,
        },
      },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    return this.mediaReadProjection.derivePostDetailMediaUrls({
      ...post,
      comments: await this.commentsReadService.listThreadedCommentsForPost(
        id,
        viewerId,
        commentsTake,
      ),
    });
  }

  // Returns the authenticated user's feed with bounded chronological pagination
  async getMyFeed(
    currentUserId: number,
    params?: PaginationParams,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);
    const relatedBlocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });
    const blockedAuthorIds = relatedBlocks.map((block) =>
      block.blockerId === currentUserId ? block.blockedId : block.blockerId,
    );

    const rows = await this.prisma.post.findMany({
      where: {
        AND: [
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
              { authorId: currentUserId },
              {
                author: {
                  privacySetting: UserPrivacySetting.PRIVATE,
                  followers: {
                    some: {
                      followerId: currentUserId,
                    },
                  },
                },
              },
            ],
          },
          ...(blockedAuthorIds.length > 0
            ? [{ authorId: { notIn: blockedAuthorIds } }]
            : []),
          ...(cursorFilter ? [cursorFilter] : []),
        ],
      },
      orderBy: [
        { createdAt: toSortDirection(orderBy) },
        { id: toSortDirection(orderBy) },
      ],

      take: take + 1,

      select: SafePostListSelect,
    });

    return buildCursorPage(rows, take);
  }

  /** Builds the viewer-sensitive visibility filter for public/private author content reads. */
  buildViewerVisibilityFilters(
    viewerId?: number | null,
  ): Prisma.PostWhereInput[] {
    if (!viewerId) {
      return [
        {
          author: {
            privacySetting: UserPrivacySetting.PUBLIC,
          },
        },
      ];
    }

    return [
      {
        OR: [
          {
            authorId: viewerId,
          },
          {
            author: {
              privacySetting: UserPrivacySetting.PUBLIC,
            },
          },
          {
            author: {
              followers: {
                some: {
                  followerId: viewerId,
                },
              },
            },
          },
        ],
      },
    ];
  }

  /** Returns author ids hidden from the viewer because of a block relationship. */
  async getBlockedAuthorIds(viewerId: number): Promise<number[]> {
    const relatedBlocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: viewerId }, { blockedId: viewerId }],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });

    return relatedBlocks.map((block) =>
      block.blockerId === viewerId ? block.blockedId : block.blockerId,
    );
  }

  // Increments the view counter and refreshes the cached detail when present
  async incrementPostViewsCount(
    id: number,
    cacheKey: string,
    detailCacheTtlMs: number,
  ): Promise<void> {
    let updatedPost: { viewsCount: number };

    try {
      updatedPost = await this.prisma.post.update({
        where: { id },
        data: {
          viewsCount: {
            increment: 1,
          },
        },
        select: {
          viewsCount: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return;
      }

      throw err;
    }

    const cachedPost = await this.cacheHelper.get<SafePostDetailDTO>(cacheKey);

    if (!cachedPost) {
      return;
    }

    await this.cacheHelper.set(
      cacheKey,
      {
        ...cachedPost,
        viewsCount: updatedPost.viewsCount,
      },
      detailCacheTtlMs,
    );
  }
}

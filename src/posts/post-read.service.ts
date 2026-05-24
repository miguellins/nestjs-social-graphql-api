import { Injectable, NotFoundException } from "@nestjs/common";

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
import type {
  SafePostEmbedDTO,
  SafePostEmbedRecord,
} from "@/posts/dto/safe-post-embed.dto";
import { PostKind } from "@/posts/enums/post-kind.enum";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";

import { CommentsReadService } from "@/comments/comments-read.service";

import { MutesService } from "@/mutes/mutes.service";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

import { PrismaService } from "@/prisma/prisma.service";

import type { Prisma } from "@prisma/client";

type PaginationParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

type PostReadProjectionRow = {
  id: number;
  title: string | null;
  content: string;
  kind: PostKind;
  sourcePostId: number | null;
  createdAt: Date;
  likesCount: number;
  commentsCount: number;
  repostsCount: number | null;
  author: unknown;
  sourcePost?: SafePostEmbedRecord | null;
};

type PostDetailProjectionRow = Omit<
  SafePostDetailDTO,
  "viewerHasReposted" | "sourcePost" | "mediaAttachments"
> & {
  sourcePost?: SafePostEmbedRecord | null;
  mediaAttachments?: import("@/posts/dto/safe-post-detail.dto").SafePostMediaAttachmentRecord[];
};

@Injectable()
export class PostReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaReadProjection: MediaReadProjectionService,
    private readonly commentsReadService: CommentsReadService,
    private readonly mutesService: MutesService,
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
    const mutedAuthorIds = viewerId
      ? await this.mutesService.getMutedUserIdsForScope(
          viewerId,
          MuteScope.POSTS,
        )
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
          ...(mutedAuthorIds.length > 0
            ? [{ authorId: { notIn: mutedAuthorIds } }]
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
      },
    });

    if (!post) {
      throw new NotFoundException("Post not found");
    }

    return this.projectPostDetailRow(
      {
        ...post,
        comments: await this.commentsReadService.listThreadedCommentsForPost(
          id,
          viewerId,
          commentsTake,
        ),
      },
      viewerId,
    );
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
    const mutedAuthorIds = await this.mutesService.getMutedUserIdsForScope(
      currentUserId,
      MuteScope.FEED,
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
          this.buildListSurfaceSourceAvailabilityFilter(currentUserId),
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
          ...(mutedAuthorIds.length > 0
            ? [{ authorId: { notIn: mutedAuthorIds } }]
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

    const page = buildCursorPage(rows, take);

    return {
      items: await this.projectPostListRows(page.items, currentUserId),
      pageInfo: page.pageInfo,
    };
  }

  /** Projects post-list rows into GraphQL-safe DTOs with embedded source and viewer repost state. */
  async projectPostListRows<T extends PostReadProjectionRow>(
    rows: T[],
    viewerId?: number | null,
  ): Promise<
    Array<
      T & {
        viewerHasReposted: boolean;
        sourcePost: SafePostEmbedDTO | null;
        repostsCount: number | null;
      }
    >
  > {
    const repostedSourceIds = await this.getViewerRepostedSourceIds(
      rows,
      viewerId,
    );

    return Promise.all(
      rows.map(async (row) =>
        this.projectPostListRow(row, repostedSourceIds, viewerId),
      ),
    );
  }

  /** Projects one post-detail row into a GraphQL-safe DTO with media URLs and repost state. */
  async projectPostDetailRow<T extends PostDetailProjectionRow>(
    row: T,
    viewerId?: number | null,
  ): Promise<SafePostDetailDTO> {
    const projected = await this.projectPostListRows([row], viewerId);
    const withMedia = this.mediaReadProjection.derivePostDetailMediaUrls({
      ...row,
      viewerHasReposted: false,
      sourcePost: null,
    });

    return {
      ...withMedia,
      ...projected[0]!,
      updatedAt: row.updatedAt,
      editedAt: row.editedAt,
      viewsCount: row.viewsCount,
      likes: row.likes,
      comments: row.comments,
      mediaAttachments: withMedia.mediaAttachments,
    };
  }

  /** Returns a where filter that hides derivatives whose source cannot be shown on list surfaces. */
  buildListSurfaceSourceAvailabilityFilter(
    viewerId?: number | null,
  ): Prisma.PostWhereInput {
    return {
      OR: [
        { kind: PostKind.ORIGINAL },
        {
          sourcePost: {
            is: {
              AND: [
                { removedAt: null },
                { author: { accountState: { not: AccountState.DEACTIVATED } } },
                ...this.buildViewerVisibilityFilters(viewerId),
              ],
            },
          },
        },
      ],
    };
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

  /** Projects one list row with source embed and viewer repost state. */
  private async projectPostListRow<T extends PostReadProjectionRow>(
    row: T,
    repostedSourceIds: Set<number>,
    viewerId?: number | null,
  ): Promise<
    T & {
      viewerHasReposted: boolean;
      sourcePost: SafePostEmbedDTO | null;
      repostsCount: number | null;
    }
  > {
    const rootSourceId = this.getRootSourceId(row);

    return {
      ...row,
      repostsCount:
        row.kind === PostKind.ORIGINAL ? (row.repostsCount ?? 0) : null,
      viewerHasReposted: rootSourceId
        ? repostedSourceIds.has(rootSourceId)
        : false,
      sourcePost:
        row.kind === PostKind.ORIGINAL
          ? null
          : await this.projectSourcePostEmbed(row.sourcePost ?? null, viewerId),
    };
  }

  /** Returns source ids the viewer has actively reposted. */
  private async getViewerRepostedSourceIds(
    rows: PostReadProjectionRow[],
    viewerId?: number | null,
  ): Promise<Set<number>> {
    if (!viewerId || rows.length === 0) return new Set();

    const sourceIds = [
      ...new Set(
        rows
          .map((row) => this.getRootSourceId(row))
          .filter((id): id is number => id !== null),
      ),
    ];

    if (sourceIds.length === 0) return new Set();

    const reposts = await this.prisma.post.findMany({
      where: {
        authorId: viewerId,
        kind: PostKind.REPOST,
        sourcePostId: { in: sourceIds },
        removedAt: null,
      },
      select: { sourcePostId: true },
    });

    return new Set(
      reposts
        .map((row) => row.sourcePostId)
        .filter((id): id is number => id !== null),
    );
  }

  /** Returns the root source id for repost-state checks. */
  private getRootSourceId(
    row: Pick<PostReadProjectionRow, "id" | "kind" | "sourcePostId">,
  ): number | null {
    return row.kind === PostKind.ORIGINAL ? row.id : row.sourcePostId;
  }

  /** Projects an embedded source post or an unavailable tombstone for direct detail reads. */
  private async projectSourcePostEmbed(
    source: SafePostEmbedRecord | null,
    viewerId?: number | null,
  ): Promise<SafePostEmbedDTO> {
    if (!source || !(await this.canViewerReadSourcePost(source, viewerId))) {
      return {
        id: null,
        title: null,
        content: null,
        kind: null,
        createdAt: null,
        likesCount: null,
        commentsCount: null,
        repostsCount: null,
        isUnavailable: true,
        author: null,
        mediaAttachments: [],
      };
    }

    return {
      id: source.id,
      title: source.title,
      content: source.content,
      kind: source.kind,
      createdAt: source.createdAt,
      likesCount: source.likesCount,
      commentsCount: source.commentsCount,
      repostsCount:
        source.kind === PostKind.ORIGINAL ? source.repostsCount : null,
      isUnavailable: false,
      author: source.author,
      mediaAttachments: source.mediaAttachments?.map((attachment) => ({
        ...attachment,
        media: this.mediaReadProjection.derivePublicUrl(attachment.media),
      })),
    };
  }

  /** Checks whether an embedded source is readable by the current viewer. */
  private async canViewerReadSourcePost(
    source: SafePostEmbedRecord,
    viewerId?: number | null,
  ): Promise<boolean> {
    if (
      source.removedAt ||
      source.author.accountState === AccountState.DEACTIVATED
    ) {
      return false;
    }

    if (viewerId === source.author.id) return true;

    if (!viewerId) {
      return source.author.privacySetting === UserPrivacySetting.PUBLIC;
    }

    const blockedAuthorIds = await this.getBlockedAuthorIds(viewerId);
    if (blockedAuthorIds.includes(source.author.id)) return false;

    if (
      await this.mutesService.isMutedForScope(
        viewerId,
        source.author.id,
        MuteScope.POSTS,
      )
    ) {
      return false;
    }

    if (source.author.privacySetting === UserPrivacySetting.PUBLIC) return true;

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: source.author.id,
        },
      },
      select: { id: true },
    });

    return Boolean(follow);
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
}

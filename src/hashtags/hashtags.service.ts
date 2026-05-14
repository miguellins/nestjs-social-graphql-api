import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

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

import { PostReadService } from "@/posts/post-read.service";
import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import {
  extractUniqueHashtagSlugs,
  normalizeHashtagSearchPrefix,
  normalizeHashtagSlug,
} from "@/hashtags/hashtag-parser";

import { MutesService } from "@/mutes/mutes.service";

import { PrismaService } from "@/prisma/prisma.service";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";
import type { Prisma } from "@prisma/client";

type HashtagTransaction = Prisma.TransactionClient;

type PublicCountablePost = {
  removedAt: Date | null;
  author: {
    accountState: AccountState;
    privacySetting: UserPrivacySetting;
  };
};

type ReplacePostHashtagsParams = {
  content: string;
  postCreatedAt: Date;
  postId: number;
  publiclyCountable: boolean;
  tx: HashtagTransaction;
};

type StripPostHashtagsParams = {
  postId: number;
  publiclyCountable: boolean;
  tx: HashtagTransaction;
};

type PostsByHashtagParams = {
  after?: string;
  first?: number;
  hashtag: string;
  orderBy?: ChronologicalOrder;
};

type SearchHashtagsParams = {
  first?: number;
  q: string;
};

export type HashtagSearchResultDTO = {
  postsCount: number;
  slug: string;
};

export type HashtagSyncResult = {
  changed: boolean;
  publicCountChanged: boolean;
};

/** Coordinates durable hashtag validation, joins, and public discovery counts. */
@Injectable()
export class HashtagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
    private readonly mutesService: MutesService,
  ) {}

  /** Returns posts attached to one normalized hashtag with normal post visibility rules. */
  async postsByHashtag(
    params: PostsByHashtagParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const slug = this.normalizeSlug(params.hashtag);
    const take = normalizeCursorTake(params.first);
    const orderBy = params.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);

    if (viewer?.id) {
      const rows = await this.findPostsByHashtagRows({
        cursorFilter,
        orderBy,
        slug,
        take,
        viewerId: viewer.id,
      });

      return buildCursorPage(rows, take);
    }

    const version = await this.cacheHelper.getVersion("v:posts:list");
    const cacheKey = `hashtags:${slug}:posts:v${version}:first=${take}:after=${params.after ?? "none"}:order=${orderBy}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.findPostsByHashtagRows({
          cursorFilter,
          orderBy,
          slug,
          take,
        });

        return buildCursorPage(rows, take);
      },
      30_000,
    );
  }

  /** Validates hashtag syntax, reserved slugs, and cap limits before post writes. */
  validatePostContentHashtags(content: string): void {
    extractUniqueHashtagSlugs(content);
  }

  /** Normalizes an API hashtag value into the canonical slug. */
  normalizeSlug(value: string): string {
    return normalizeHashtagSlug(value);
  }

  /** Searches hashtags by normalized slug prefix ordered by public post count. */
  async searchHashtags(
    params: SearchHashtagsParams,
  ): Promise<HashtagSearchResultDTO[]> {
    const query = normalizeHashtagSearchPrefix(params.q);
    const take = Math.min(
      params.first ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );
    const version = await this.cacheHelper.getVersion("v:hashtags:list");
    const cacheKey = `hashtags:search:v${version}:q=${query}:first=${take}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () =>
        this.prisma.hashtag.findMany({
          take,
          where: {
            slug: {
              startsWith: query,
            },
          },
          orderBy: [{ postsCount: "desc" }, { slug: "asc" }],
          select: {
            slug: true,
            postsCount: true,
          },
        }),
      30_000,
    );
  }

  /** Returns whether a post contributes to anonymous public hashtag counts. */
  isPubliclyCountablePost(post: PublicCountablePost): boolean {
    return (
      post.removedAt === null &&
      post.author.privacySetting === UserPrivacySetting.PUBLIC &&
      post.author.accountState !== AccountState.DEACTIVATED
    );
  }

  /** Replaces a post's hashtag joins and applies same-transaction count deltas. */
  async replacePostHashtags({
    content,
    postCreatedAt,
    postId,
    publiclyCountable,
    tx,
  }: ReplacePostHashtagsParams): Promise<HashtagSyncResult> {
    const nextSlugs = extractUniqueHashtagSlugs(content);
    const existingRows = await tx.postHashtag.findMany({
      where: { postId },
      select: {
        hashtagId: true,
        hashtag: {
          select: {
            slug: true,
          },
        },
      },
    });
    const existingBySlug = new Map(
      existingRows.map((row) => [row.hashtag.slug, row.hashtagId]),
    );
    const nextSlugSet = new Set(nextSlugs);
    const removedHashtagIds = existingRows
      .filter((row) => !nextSlugSet.has(row.hashtag.slug))
      .map((row) => row.hashtagId);
    const addedSlugs = nextSlugs.filter((slug) => !existingBySlug.has(slug));

    if (removedHashtagIds.length > 0) {
      await tx.postHashtag.deleteMany({
        where: {
          postId,
          hashtagId: {
            in: removedHashtagIds,
          },
        },
      });

      if (publiclyCountable) {
        await this.adjustPostsCount(tx, removedHashtagIds, -1);
      }
    }

    if (addedSlugs.length === 0) {
      return {
        changed: removedHashtagIds.length > 0,
        publicCountChanged: publiclyCountable && removedHashtagIds.length > 0,
      };
    }

    const addedHashtagIds = await this.upsertHashtags(tx, addedSlugs);

    await tx.postHashtag.createMany({
      data: addedHashtagIds.map((hashtagId) => ({
        postId,
        hashtagId,
        postCreatedAt,
      })),
      skipDuplicates: true,
    });

    if (publiclyCountable) {
      await this.adjustPostsCount(tx, addedHashtagIds, 1);
    }

    return {
      changed: true,
      publicCountChanged: publiclyCountable,
    };
  }

  /** Deletes all hashtag joins for a removed post and decrements public counts. */
  async stripPostHashtags({
    postId,
    publiclyCountable,
    tx,
  }: StripPostHashtagsParams): Promise<HashtagSyncResult> {
    const existingRows = await tx.postHashtag.findMany({
      where: { postId },
      select: {
        hashtagId: true,
      },
    });
    const hashtagIds = existingRows.map((row) => row.hashtagId);

    if (hashtagIds.length === 0) {
      return {
        changed: false,
        publicCountChanged: false,
      };
    }

    await tx.postHashtag.deleteMany({
      where: { postId },
    });

    if (publiclyCountable) {
      await this.adjustPostsCount(tx, hashtagIds, -1);
    }

    return {
      changed: true,
      publicCountChanged: publiclyCountable,
    };
  }

  /** Upserts hashtag rows and returns ids in slug order. */
  private async upsertHashtags(
    tx: HashtagTransaction,
    slugs: string[],
  ): Promise<number[]> {
    const ids: number[] = [];

    for (const slug of slugs) {
      const hashtag = await tx.hashtag.upsert({
        where: { slug },
        create: {
          slug,
          postsCount: 0,
        },
        update: {},
        select: {
          id: true,
        },
      });

      ids.push(hashtag.id);
    }

    return ids;
  }

  /** Applies a count delta to the provided hashtag ids. */
  private async adjustPostsCount(
    tx: HashtagTransaction,
    hashtagIds: number[],
    delta: 1 | -1,
  ): Promise<void> {
    if (hashtagIds.length === 0) return;

    await tx.hashtag.updateMany({
      where: {
        id: {
          in: hashtagIds,
        },
      },
      data: {
        postsCount: delta > 0 ? { increment: 1 } : { decrement: 1 },
      },
    });
  }

  /** Reads hashtag posts with the same viewer visibility filters as public timelines. */
  private async findPostsByHashtagRows(params: {
    cursorFilter?: Prisma.PostWhereInput;
    orderBy: ChronologicalOrder;
    slug: string;
    take: number;
    viewerId?: number;
  }): Promise<SafePostListDTO[]> {
    const filters: Prisma.PostWhereInput[] = [
      { removedAt: null },
      {
        hashtags: {
          some: {
            hashtag: {
              slug: params.slug,
            },
          },
        },
      },
      {
        author: params.viewerId
          ? {
              accountState: {
                not: AccountState.DEACTIVATED,
              },
            }
          : {
              privacySetting: UserPrivacySetting.PUBLIC,
              accountState: {
                not: AccountState.DEACTIVATED,
              },
            },
      },
      ...this.postReadService.buildViewerVisibilityFilters(params.viewerId),
    ];

    if (params.viewerId) {
      const [blockedAuthorIds, mutedAuthorIds] = await Promise.all([
        this.postReadService.getBlockedAuthorIds(params.viewerId),
        this.mutesService.getMutedUserIds(params.viewerId),
      ]);

      if (blockedAuthorIds.length > 0) {
        filters.push({ authorId: { notIn: blockedAuthorIds } });
      }

      if (mutedAuthorIds.length > 0) {
        filters.push({ authorId: { notIn: mutedAuthorIds } });
      }
    }

    if (params.cursorFilter) {
      filters.push(params.cursorFilter);
    }

    return this.prisma.post.findMany({
      take: params.take + 1,
      where: filters.length === 1 ? filters[0] : { AND: filters },
      orderBy: [
        { createdAt: toSortDirection(params.orderBy) },
        { id: toSortDirection(params.orderBy) },
      ],
      select: SafePostListSelect,
    });
  }

  /** Enforces that authenticated hashtag reads come only from active accounts. */
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

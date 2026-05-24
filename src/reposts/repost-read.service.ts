import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
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
import { SafePostListSelect } from "@/posts/dto/safe-post-list.dto";

import { MutesService } from "@/mutes/mutes.service";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

import { AccountState } from "@/users/enums/account-state.enum";

import type { RepostListItem } from "@/reposts/models/repost-list-item.model";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { PrismaService } from "@/prisma/prisma.service";
import { PostKind, Prisma } from "@prisma/client";

type RepostListParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

type FindRepostsParams = RepostListParams & {
  postId: number;
};

type RepostRow = Prisma.PostGetPayload<{ select: typeof SafePostListSelect }>;

@Injectable()
export class RepostReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
    private readonly mutesService: MutesService,
  ) {}

  /** Lists repost wrappers for one visible root source post. */
  async findReposts(
    params: FindRepostsParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<RepostListItem>> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const source = await this.getVisibleRootSourcePost(
      params.postId,
      viewer?.id,
    );
    const take = normalizeCursorTake(params.first);
    const orderBy = params.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);

    if (viewer?.id) {
      return this.findRepostRows({
        cursorFilter,
        orderBy,
        sourcePostId: source.id,
        take,
        viewerId: viewer.id,
      });
    }

    const version = await this.cacheHelper.getVersion("v:reposts:list");
    const cacheKey =
      "reposts:list:v" +
      version +
      ":source=" +
      source.id +
      ":first=" +
      take +
      ":after=" +
      (params.after ?? "none") +
      ":order=" +
      orderBy;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () =>
        this.findRepostRows({
          cursorFilter,
          orderBy,
          sourcePostId: source.id,
          take,
        }),
      30_000,
    );
  }

  /** Lists the authenticated user's repost wrappers with visible source previews. */
  async findMyReposts(
    currentUserId: number,
    params?: RepostListParams,
  ): Promise<CursorPageResult<RepostListItem>> {
    await this.assertActiveCurrentUserById(currentUserId);

    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);
    const version = await this.cacheHelper.getVersion(
      "v:user:" + currentUserId + ":reposts:list",
    );
    const cacheKey =
      "user:" +
      currentUserId +
      ":reposts:list:v" +
      version +
      ":first=" +
      take +
      ":after=" +
      (params?.after ?? "none") +
      ":order=" +
      orderBy;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () =>
        this.findRepostRows({
          authorId: currentUserId,
          cursorFilter,
          orderBy,
          take,
          viewerId: currentUserId,
        }),
      30_000,
    );
  }

  /** Reads repost rows with bounded pagination and source availability filters. */
  private async findRepostRows(params: {
    authorId?: number;
    cursorFilter?: Prisma.PostWhereInput;
    orderBy: ChronologicalOrder;
    sourcePostId?: number;
    take: number;
    viewerId?: number;
  }): Promise<CursorPageResult<RepostListItem>> {
    const filters: Prisma.PostWhereInput[] = [
      { kind: PostKind.REPOST },
      { removedAt: null },
      { author: { accountState: AccountState.ACTIVE } },
      this.postReadService.buildListSurfaceSourceAvailabilityFilter(
        params.viewerId,
      ),
    ];

    if (params.sourcePostId !== undefined) {
      filters.push({ sourcePostId: params.sourcePostId });
    }

    if (params.authorId !== undefined) {
      filters.push({ authorId: params.authorId });
    }

    if (params.cursorFilter) {
      filters.push(params.cursorFilter);
    }

    if (params.viewerId) {
      const [blockedAuthorIds, mutedAuthorIds] = await Promise.all([
        this.postReadService.getBlockedAuthorIds(params.viewerId),
        this.mutesService.getMutedUserIdsForScope(
          params.viewerId,
          MuteScope.POSTS,
        ),
      ]);

      if (blockedAuthorIds.length > 0) {
        filters.push({ authorId: { notIn: blockedAuthorIds } });
      }

      if (mutedAuthorIds.length > 0) {
        filters.push({ authorId: { notIn: mutedAuthorIds } });
      }
    }

    const rows = await this.prisma.post.findMany({
      take: params.take + 1,
      where: filters.length === 1 ? filters[0] : { AND: filters },
      orderBy: [
        { createdAt: toSortDirection(params.orderBy) },
        { id: toSortDirection(params.orderBy) },
      ],
      select: SafePostListSelect,
    });
    const page = buildCursorPage(rows, params.take);

    return {
      items: await this.projectRepostRows(page.items, params.viewerId),
      pageInfo: page.pageInfo,
    };
  }

  /** Projects repost rows into the public list-item shape. */
  private async projectRepostRows(
    rows: RepostRow[],
    viewerId?: number,
  ): Promise<RepostListItem[]> {
    const projected = await this.postReadService.projectPostListRows(
      rows,
      viewerId,
    );

    return projected.map((row) => {
      if (!row.sourcePost || row.sourcePost.isUnavailable) {
        throw new NotFoundException("Post not found");
      }

      return {
        id: row.id,
        sourcePostId: row.sourcePostId!,
        createdAt: row.createdAt,
        author: row.author,
        sourcePost: row.sourcePost,
      };
    });
  }

  /** Resolves requested post ids to visible root original sources. */
  private async getVisibleRootSourcePost(
    postId: number,
    viewerId?: number,
  ): Promise<{ id: number }> {
    const requested = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, kind: true, sourcePostId: true },
    });

    if (!requested) {
      throw new NotFoundException("Post not found");
    }

    const sourceId =
      requested.kind === PostKind.ORIGINAL
        ? requested.id
        : requested.sourcePostId;

    if (!sourceId) {
      throw new NotFoundException("Post not found");
    }

    const filters: Prisma.PostWhereInput[] = [
      { id: sourceId },
      { kind: PostKind.ORIGINAL },
      { removedAt: null },
      { author: { accountState: { not: AccountState.DEACTIVATED } } },
      ...this.postReadService.buildViewerVisibilityFilters(viewerId),
    ];

    if (viewerId) {
      const [blockedAuthorIds, mutedAuthorIds] = await Promise.all([
        this.postReadService.getBlockedAuthorIds(viewerId),
        this.mutesService.getMutedUserIdsForScope(viewerId, MuteScope.POSTS),
      ]);

      if (blockedAuthorIds.length > 0) {
        filters.push({ authorId: { notIn: blockedAuthorIds } });
      }

      if (mutedAuthorIds.length > 0) {
        filters.push({ authorId: { notIn: mutedAuthorIds } });
      }
    }

    const source = await this.prisma.post.findFirst({
      where: { AND: filters },
      select: { id: true },
    });

    if (!source) {
      throw new NotFoundException("Post not found");
    }

    return source;
  }

  /** Ensures authenticated repost reads cannot be performed by disabled accounts. */
  private async assertActiveCurrentUserById(
    currentUserId: number,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { accountState: true },
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

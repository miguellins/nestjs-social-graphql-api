import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
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
import { parseWithBadRequest } from "@/common/zod/parse-with-zod";

import { PostReadService } from "@/posts/post-read.service";
import {
  type SafePostListDTO,
  SafePostListSelect,
} from "@/posts/dto/safe-post-list.dto";

import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import {
  getUserByUsernameCommandSchema,
  type GetUserByUsernameCommand,
} from "@/users/schemas/user-read.schema";

import type { AuthenticatedUser } from "@/auth/authenticated-user.type";

import { MutesService } from "@/mutes/mutes.service";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

import { PrismaService } from "@/prisma/prisma.service";

import { Prisma } from "@prisma/client";

type PaginationParams = {
  after?: string;
  first?: number;
  take?: number;
  orderBy?: ChronologicalOrder;
};

type FindPostsParams = PaginationParams & {
  q?: string;
};

@Injectable()
export class PostListReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly postReadService: PostReadService,
    private readonly mutesService: MutesService,
  ) {}

  /** Returns the public or viewer-sensitive post list with stable cache keys. */
  async findPosts(
    params?: FindPostsParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const take = normalizeCursorTake(params?.first);

    const search = params?.q?.trim().toLowerCase() || undefined;
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    if (viewer?.id) {
      const blockedAuthorIds = await this.postReadService.getBlockedAuthorIds(
        viewer.id,
      );
      const mutedAuthorIds = await this.mutesService.getMutedUserIdsForScope(
        viewer.id,
        MuteScope.POSTS,
      );
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
        ...this.postReadService.buildViewerVisibilityFilters(viewer.id),
        this.postReadService.buildListSurfaceSourceAvailabilityFilter(
          viewer.id,
        ),
      ];

      if (blockedAuthorIds.length > 0) {
        filters.push({
          authorId: {
            notIn: blockedAuthorIds,
          },
        });
      }

      if (mutedAuthorIds.length > 0) {
        filters.push({
          authorId: {
            notIn: mutedAuthorIds,
          },
        });
      }

      if (search) {
        filters.push({
          OR: [
            { title: { contains: search } },
            { content: { contains: search } },
          ],
        });
      }

      if (cursorFilter) {
        filters.push(cursorFilter);
      }

      const rows = await this.prisma.post.findMany({
        take: take + 1,
        where: filters.length === 1 ? filters[0] : { AND: filters },
        orderBy: [
          { createdAt: toSortDirection(orderby) },
          { id: toSortDirection(orderby) },
        ],
        select: SafePostListSelect,
      });

      const page = buildCursorPage(rows, take);

      return {
        items: await this.postReadService.projectPostListRows(
          page.items,
          viewer.id,
        ),
        pageInfo: page.pageInfo,
      };
    }

    const v = await this.cacheHelper.getVersion("v:posts:list");
    const cacheKey = `posts:list:v${v}:first=${take}:after=${params?.after ?? "none"}:q=${search ?? "all"}:order=${orderby}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const filters: Prisma.PostWhereInput[] = [];

        filters.push({
          removedAt: null,
        });
        filters.push({
          author: {
            privacySetting: UserPrivacySetting.PUBLIC,
            accountState: {
              not: AccountState.DEACTIVATED,
            },
          },
        });
        filters.push(
          this.postReadService.buildListSurfaceSourceAvailabilityFilter(),
        );

        if (search) {
          filters.push({
            OR: [
              { title: { contains: search } },
              { content: { contains: search } },
            ],
          });
        }

        if (cursorFilter) {
          filters.push(cursorFilter);
        }

        const where =
          filters.length === 0
            ? undefined
            : filters.length === 1
              ? filters[0]
              : { AND: filters };

        const rows = await this.prisma.post.findMany({
          take: take + 1,

          where,

          orderBy: [
            { createdAt: toSortDirection(orderby) },
            { id: toSortDirection(orderby) },
          ],

          select: SafePostListSelect,
        });

        const page = buildCursorPage(rows, take);

        return {
          items: await this.postReadService.projectPostListRows(page.items),
          pageInfo: page.pageInfo,
        };
      },
      30_000,
    );
  }

  /** Returns one author's visible post list with stable username normalization and cache keys. */
  async findPostsByUsername(
    username: string,
    params?: PaginationParams,
    viewer?: AuthenticatedUser,
  ): Promise<CursorPageResult<SafePostListDTO>> {
    if (viewer?.id) {
      await this.assertActiveCurrentUserById(viewer.id);
    }

    const normalized = this.parseGetUserByUsernameInput({ username });

    const take = normalizeCursorTake(
      "first" in (params ?? {}) ? params?.first : undefined,
    );

    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const after =
      "after" in (params ?? {}) && typeof params?.after === "string"
        ? params.after
        : undefined;
    const cursor = after ? decodeChronoCursor(after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    const author = await this.prisma.user.findUnique({
      where: { username: normalized.username },
      select: {
        id: true,
        privacySetting: true,
        accountState: true,
      },
    });

    if (!author || author.accountState === AccountState.DEACTIVATED) {
      throw new NotFoundException("User not found");
    }

    if (!(await this.canViewerReadAuthorContent(viewer?.id, author))) {
      throw new NotFoundException("User not found");
    }

    const authorId = author.id;

    const versionKey = this.getUserPostsListVersionKey(authorId);
    const v = await this.cacheHelper.getVersion(versionKey);
    const cacheKey = `user:${authorId}:posts:list:v${v}:first=${take}:after=${after ?? "none"}:order=${orderby}`;

    if (viewer?.id || author.privacySetting === UserPrivacySetting.PRIVATE) {
      const rows = await this.prisma.post.findMany({
        take: take + 1,
        where: cursorFilter
          ? {
              AND: [
                { authorId },
                { removedAt: null },
                this.postReadService.buildListSurfaceSourceAvailabilityFilter(
                  viewer?.id,
                ),
                cursorFilter,
              ],
            }
          : {
              AND: [
                { authorId },
                { removedAt: null },
                this.postReadService.buildListSurfaceSourceAvailabilityFilter(
                  viewer?.id,
                ),
              ],
            },
        orderBy: [
          { createdAt: toSortDirection(orderby) },
          { id: toSortDirection(orderby) },
        ],
        select: SafePostListSelect,
      });

      const page = buildCursorPage(rows, take);

      return {
        items: await this.postReadService.projectPostListRows(
          page.items,
          viewer?.id,
        ),
        pageInfo: page.pageInfo,
      };
    }

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.prisma.post.findMany({
          take: take + 1,
          where: cursorFilter
            ? {
                AND: [
                  { authorId },
                  { removedAt: null },
                  this.postReadService.buildListSurfaceSourceAvailabilityFilter(),
                  cursorFilter,
                ],
              }
            : {
                AND: [
                  { authorId },
                  { removedAt: null },
                  this.postReadService.buildListSurfaceSourceAvailabilityFilter(),
                ],
              },

          orderBy: [
            { createdAt: toSortDirection(orderby) },
            { id: toSortDirection(orderby) },
          ],

          select: SafePostListSelect,
        });

        const page = buildCursorPage(rows, take);

        return {
          items: await this.postReadService.projectPostListRows(page.items),
          pageInfo: page.pageInfo,
        };
      },
      30_000,
    );
  }

  /** Parses and normalizes public username lookup input. */
  private parseGetUserByUsernameInput(input: GetUserByUsernameCommand) {
    return parseWithBadRequest(
      getUserByUsernameCommandSchema,
      input,
      "Invalid post author lookup input",
    );
  }

  /** Returns the cache version key string for a user's post list. */
  private getUserPostsListVersionKey(userId: number): string {
    return `v:user:${userId}:posts:list`;
  }

  /** Checks whether the viewer can read one author's content under privacy/account-state rules. */
  private async canViewerReadAuthorContent(
    viewerId: number | undefined,
    author: {
      id: number;
      privacySetting: UserPrivacySetting;
      accountState: AccountState;
    },
  ): Promise<boolean> {
    if (author.accountState === AccountState.DEACTIVATED) {
      return false;
    }

    if (viewerId === author.id) {
      return true;
    }

    if (!viewerId) {
      return author.privacySetting === UserPrivacySetting.PUBLIC;
    }

    const blockRelationship = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: viewerId,
            blockedId: author.id,
          },
          {
            blockerId: author.id,
            blockedId: viewerId,
          },
        ],
      },
      select: { id: true },
    });

    if (blockRelationship) {
      return false;
    }

    if (
      await this.mutesService.isMutedForScope(
        viewerId,
        author.id,
        MuteScope.POSTS,
      )
    ) {
      return false;
    }

    if (author.privacySetting === UserPrivacySetting.PUBLIC) {
      return true;
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: author.id,
        },
      },
      select: { id: true },
    });

    return Boolean(follow);
  }

  /** Ensures authenticated post list reads cannot be performed by disabled accounts. */
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

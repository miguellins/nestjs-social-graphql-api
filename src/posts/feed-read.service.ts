import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
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
  type HomeFeedItemRecord,
  HomeFeedItemSelect,
} from "@/posts/dto/home-feed-item.dto";

import { HOME_FEED_USER_BOOTSTRAP_EVENT } from "@/outbox/events/home-feed-user-bootstrap.event";
import { HOME_FEED_POST_CLEANUP_EVENT } from "@/outbox/events/home-feed-cleanup.event";
import { OutboxService } from "@/outbox/outbox.service";

import { MediaReadProjectionService } from "@/media/media-read-projection.service";
import {
  MetricsRegistryService,
  type HomeFeedShadowMismatchCategory,
} from "@/metrics/metrics-registry.service";

import { AccountState } from "@/users/enums/account-state.enum";

import { MutesService } from "@/mutes/mutes.service";
import { MuteScope } from "@/mutes/enums/mute-scope.enum";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

import { createHash } from "crypto";

type HomeFeedParams = {
  after?: string;
  first?: number;
  orderBy?: ChronologicalOrder;
};

type ProjectionReadResult = CursorPageResult<HomeFeedItemDTO> & {
  fallbackReason?: ProjectionFallbackReason;
};

type ProjectionFallbackReason = "missing_hydration_gap" | "read_error";

type ShadowCompareMismatch = {
  category: HomeFeedShadowMismatchCategory;
  firstDivergentIndex: number | null;
};

@Injectable()
export class FeedReadService {
  private readonly logger = new Logger(FeedReadService.name);
  private readonly projectionReadEnabled: boolean;
  private readonly shadowCompareEnabled: boolean;
  private readonly shadowCompareDebugOnly: boolean;
  private readonly shadowCompareSampleRate: number;
  private readonly shadowCompareForceUserId: number | undefined;
  private readonly feedProjectionEnqueueEnabled: boolean;
  private readonly projectionReadCohortEnabled: boolean;
  private readonly projectionReadCohortSampleRate: number;
  private readonly projectionReadAllowUserIds: Set<number>;
  private readonly projectionReadDenyUserIds: Set<number>;
  private readonly projectionReadForceUserId: number | undefined;
  private readonly projectionFallbackEnabled: boolean;
  private readonly projectionReadRequirePopulated: boolean;
  private readonly projectionUnsafeMissingRatio: number;

  /** Returns the authenticated user's home feed with bounded chronological pagination. */
  async getHomeFeed(
    currentUserId: number,
    params?: HomeFeedParams,
  ): Promise<CursorPageResult<HomeFeedItemDTO>> {
    await this.assertActiveCurrentUserById(currentUserId);

    const useProjection = await this.shouldUseProjectionRead(currentUserId);
    if (!useProjection) {
      const legacy = await this.getHomeFeedFanoutOnRead(currentUserId, params);
      this.metricsRegistry.incrementHomeFeedReadSource("legacy");
      return legacy;
    }

    const projectionResult = await this.safeGetHomeFeedFromProjection(
      currentUserId,
      params,
    );

    if (projectionResult.fallbackReason) {
      this.metricsRegistry.incrementHomeFeedProjectionFallback(
        projectionResult.fallbackReason,
      );
      if (!this.projectionFallbackEnabled) return projectionResult;

      const legacy = await this.getHomeFeedFanoutOnRead(currentUserId, params);
      this.metricsRegistry.incrementHomeFeedReadSource("legacy");
      return legacy;
    }

    if (this.shouldShadowCompare(currentUserId)) {
      void this.shadowCompareHomeFeed(currentUserId, params, projectionResult);
    }

    this.metricsRegistry.incrementHomeFeedReadSource("projection");
    return projectionResult;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaReadProjection: MediaReadProjectionService,
    private readonly postReadService: PostReadService,
    private readonly mutesService: MutesService,
    private readonly outboxService: OutboxService,
    private readonly metricsRegistry: MetricsRegistryService,
    configService: ConfigService,
  ) {
    this.projectionReadEnabled =
      configService.get<boolean>("FEED_PROJECTION_READ_ENABLED") ?? false;
    this.shadowCompareEnabled =
      configService.get<boolean>("FEED_PROJECTION_SHADOW_COMPARE_ENABLED") ??
      false;
    this.shadowCompareDebugOnly =
      configService.get<boolean>("FEED_PROJECTION_SHADOW_COMPARE_DEBUG_ONLY") ??
      true;
    this.shadowCompareSampleRate =
      configService.get<number>("FEED_PROJECTION_SHADOW_COMPARE_SAMPLE_RATE") ??
      0.005;
    this.shadowCompareForceUserId = configService.get<number>(
      "FEED_PROJECTION_SHADOW_COMPARE_FORCE_USER_ID",
    );
    this.feedProjectionEnqueueEnabled =
      configService.get<boolean>("FEED_PROJECTION_ENQUEUE_ENABLED") ?? false;

    this.projectionReadCohortEnabled =
      configService.get<boolean>("FEED_PROJECTION_READ_COHORT_ENABLED") ??
      false;
    this.projectionReadCohortSampleRate =
      configService.get<number>("FEED_PROJECTION_READ_COHORT_SAMPLE_RATE") ?? 0;
    this.projectionReadAllowUserIds = parsePositiveIntSet(
      configService.get<string>("FEED_PROJECTION_READ_ALLOW_USER_IDS"),
    );
    this.projectionReadDenyUserIds = parsePositiveIntSet(
      configService.get<string>("FEED_PROJECTION_READ_DENY_USER_IDS"),
    );
    this.projectionReadForceUserId = configService.get<number>(
      "FEED_PROJECTION_READ_FORCE_USER_ID",
    );
    this.projectionFallbackEnabled =
      configService.get<boolean>("FEED_PROJECTION_FALLBACK_ENABLED") ?? true;
    this.projectionReadRequirePopulated =
      configService.get<boolean>("FEED_PROJECTION_READ_REQUIRE_POPULATED") ??
      true;
    this.projectionUnsafeMissingRatio =
      configService.get<number>("FEED_PROJECTION_UNSAFE_MISSING_RATIO") ?? 0.5;
  }

  /** Reads from projection and converts unsafe failures into legacy fallback. */
  private async safeGetHomeFeedFromProjection(
    currentUserId: number,
    params?: HomeFeedParams,
  ): Promise<ProjectionReadResult> {
    try {
      return await this.getHomeFeedFromProjection(currentUserId, params);
    } catch (error) {
      this.logger.error(
        "homeFeed projection read failed; falling back to legacy",
        error instanceof Error ? error.stack : undefined,
        FeedReadService.name,
      );
      return {
        items: [],
        pageInfo: { endCursor: null, hasNextPage: false },
        fallbackReason: "read_error",
      };
    }
  }

  /** Decides whether the current request should read from the projected feed. */
  private async shouldUseProjectionRead(
    currentUserId: number,
  ): Promise<boolean> {
    if (this.projectionReadDenyUserIds.has(currentUserId)) return false;

    if (this.projectionReadAllowUserIds.has(currentUserId)) {
      return this.isProjectionPopulatedOrBootstrapped(currentUserId);
    }

    if (
      this.projectionReadForceUserId !== undefined &&
      currentUserId === this.projectionReadForceUserId
    ) {
      return this.isProjectionPopulatedOrBootstrapped(currentUserId);
    }

    if (this.projectionReadEnabled) {
      return this.isProjectionPopulatedOrBootstrapped(currentUserId);
    }

    if (!this.projectionReadCohortEnabled) return false;
    if (this.projectionReadCohortSampleRate <= 0) return false;

    if (
      !isUserInDeterministicCohort(
        currentUserId,
        this.projectionReadCohortSampleRate,
      )
    ) {
      return false;
    }

    return this.isProjectionPopulatedOrBootstrapped(currentUserId);
  }

  /** Checks projection readiness and queues a bootstrap when required. */
  private async isProjectionPopulatedOrBootstrapped(
    currentUserId: number,
  ): Promise<boolean> {
    if (!this.projectionReadRequirePopulated) return true;

    const count = await this.prisma.homeFeedEntry.count({
      where: { userId: currentUserId, hiddenAt: null },
    });

    if (count > 0) return true;

    // Phase 3: prepopulate projections for cohort users, but keep serving legacy until ready.
    this.bestEffortEnqueueHomeFeedBootstrap(currentUserId);
    return false;
  }

  /** Queues best-effort projected-feed bootstrap work for one user. */
  private bestEffortEnqueueHomeFeedBootstrap(currentUserId: number): void {
    if (!this.feedProjectionEnqueueEnabled) return;

    void runBestEffort(
      this.logger,
      "error",
      `Failed to enqueue home feed bootstrap for user ${currentUserId}`,
      async () => {
        await this.outboxService.enqueue({
          eventType: HOME_FEED_USER_BOOTSTRAP_EVENT,
          aggregateType: "user",
          aggregateId: currentUserId,
          payload: { userId: currentUserId },
        });
      },
    );
  }

  /** Reads the home feed directly from posts and follow relationships. */
  private async getHomeFeedFanoutOnRead(
    currentUserId: number,
    params?: HomeFeedParams,
  ): Promise<CursorPageResult<HomeFeedItemDTO>> {
    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = cursor
      ? orderBy === ChronologicalOrder.OLDEST
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
      : undefined;
    const blockedAuthorIds =
      await this.postReadService.getBlockedAuthorIds(currentUserId);
    const mutedAuthorIds = await this.mutesService.getMutedUserIdsForScope(
      currentUserId,
      MuteScope.FEED,
    );

    const filters: Prisma.PostWhereInput[] = [
      {
        removedAt: null,
      },
      {
        author: {
          accountState: AccountState.ACTIVE,
        },
      },
      this.postReadService.buildListSurfaceSourceAvailabilityFilter(
        currentUserId,
      ),
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

    if (mutedAuthorIds.length > 0) {
      filters.push({
        authorId: {
          notIn: mutedAuthorIds,
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
      items: await this.projectHomeFeedRows(page.items, currentUserId),
      pageInfo: page.pageInfo,
    };
  }

  /** Projects home-feed rows with media URLs, viewer relation flags, and repost source state. */
  private async projectHomeFeedRows(
    rows: HomeFeedItemRecord[],
    currentUserId: number,
  ): Promise<HomeFeedItemDTO[]> {
    const listRows = await this.postReadService.projectPostListRows(
      rows,
      currentUserId,
    );

    return rows.map((row, index) => {
      const mediaProjected =
        this.mediaReadProjection.deriveHomeFeedItemMediaUrls(row);
      const projected = listRows[index]!;

      return {
        ...mediaProjected,
        kind: projected.kind,
        sourcePostId: projected.sourcePostId,
        repostsCount: projected.repostsCount,
        viewerHasReposted: projected.viewerHasReposted,
        sourcePost: projected.sourcePost,
      };
    });
  }

  /** Reads the home feed from persisted projection entries and hydrates posts. */
  private async getHomeFeedFromProjection(
    currentUserId: number,
    params?: HomeFeedParams,
  ): Promise<ProjectionReadResult> {
    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;

    const cursorFilter = cursor
      ? orderBy === ChronologicalOrder.OLDEST
        ? {
            OR: [
              { postCreatedAt: { gt: cursor.createdAt } },
              { postCreatedAt: cursor.createdAt, postId: { gt: cursor.id } },
            ],
          }
        : {
            OR: [
              { postCreatedAt: { lt: cursor.createdAt } },
              { postCreatedAt: cursor.createdAt, postId: { lt: cursor.id } },
            ],
          }
      : undefined;

    const mutedAuthorIds = await this.mutesService.getMutedUserIdsForScope(
      currentUserId,
      MuteScope.FEED,
    );

    const entries = await this.prisma.homeFeedEntry.findMany({
      take: take + 1,
      where: cursorFilter
        ? {
            AND: [
              { userId: currentUserId },
              { hiddenAt: null },
              ...(mutedAuthorIds.length > 0
                ? [{ postAuthorId: { notIn: mutedAuthorIds } }]
                : []),
              cursorFilter,
            ],
          }
        : {
            AND: [
              { userId: currentUserId },
              { hiddenAt: null },
              ...(mutedAuthorIds.length > 0
                ? [{ postAuthorId: { notIn: mutedAuthorIds } }]
                : []),
            ],
          },
      orderBy: [
        { postCreatedAt: toSortDirection(orderBy) },
        { postId: toSortDirection(orderBy) },
      ],
      select: {
        postId: true,
        postCreatedAt: true,
      },
    });

    const page = buildCursorPage(
      entries.map((row) => ({
        createdAt: row.postCreatedAt,
        id: row.postId,
      })),
      take,
    );

    const postIds = page.items.map((row) => row.id);
    const newestProjectedAt = page.items[0]?.createdAt;
    if (newestProjectedAt) {
      this.metricsRegistry.recordHomeFeedProjectionReadLag(
        Math.max(0, (Date.now() - newestProjectedAt.getTime()) / 1_000),
      );
    }

    if (postIds.length === 0) {
      return {
        items: [],
        pageInfo: page.pageInfo,
      };
    }

    const blockedAuthorIds =
      await this.postReadService.getBlockedAuthorIds(currentUserId);

    const filters: Prisma.PostWhereInput[] = [
      { id: { in: postIds } },
      { removedAt: null },
      {
        author: {
          accountState: AccountState.ACTIVE,
        },
      },
      this.postReadService.buildListSurfaceSourceAvailabilityFilter(
        currentUserId,
      ),
    ];

    if (blockedAuthorIds.length > 0) {
      filters.push({ authorId: { notIn: blockedAuthorIds } });
    }

    if (mutedAuthorIds.length > 0) {
      filters.push({ authorId: { notIn: mutedAuthorIds } });
    }

    const rows = await this.prisma.post.findMany({
      where: filters.length === 1 ? filters[0] : { AND: filters },
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

    const byId = new Map<number, (typeof rows)[number]>();
    for (const row of rows) byId.set(row.id, row);

    const ordered: HomeFeedItemDTO[] = [];
    const missingPostIds: number[] = [];

    for (const id of postIds) {
      const row = byId.get(id);
      if (!row) {
        missingPostIds.push(id);
        continue;
      }
      ordered.push(...(await this.projectHomeFeedRows([row], currentUserId)));
    }

    if (missingPostIds.length > 0) {
      this.bestEffortCleanupMissingProjectionRows(missingPostIds);
    }

    if (this.isUnsafeHydrationGap(postIds.length, ordered.length)) {
      this.logger.warn("homeFeed projection hydration gap triggered fallback", {
        currentUserId,
        requestedPostIds: postIds.length,
        hydratedPosts: ordered.length,
        missingPosts: missingPostIds.length,
      });
      return {
        items: [],
        pageInfo: page.pageInfo,
        fallbackReason: "missing_hydration_gap",
      };
    }

    return {
      items: ordered,
      pageInfo: page.pageInfo,
    };
  }

  /** Treats high projection hydration gaps as unsafe for cursor correctness. */
  private isUnsafeHydrationGap(
    entryCount: number,
    hydratedCount: number,
  ): boolean {
    if (entryCount === 0) return false;
    if (hydratedCount === 0) return true;

    const missingRatio = (entryCount - hydratedCount) / entryCount;
    return missingRatio >= this.projectionUnsafeMissingRatio;
  }

  /** Decides whether to compare projected feed results against the legacy path. */
  private shouldShadowCompare(currentUserId: number): boolean {
    if (!this.shadowCompareEnabled) return false;
    if (
      this.shadowCompareForceUserId !== undefined &&
      currentUserId === this.shadowCompareForceUserId
    ) {
      return true;
    }
    if (this.shadowCompareDebugOnly) return false;
    return Math.random() < this.shadowCompareSampleRate;
  }

  /** Logs mismatches between projected and legacy home-feed results. */
  private async shadowCompareHomeFeed(
    currentUserId: number,
    params: HomeFeedParams | undefined,
    projection: CursorPageResult<HomeFeedItemDTO>,
  ): Promise<void> {
    this.metricsRegistry.incrementHomeFeedShadowCompare();
    const legacy = await this.getHomeFeedFanoutOnRead(currentUserId, params);

    const legacyIds = legacy.items.map((item) => item.id);
    const projectionIds = projection.items.map((item) => item.id);
    const mismatch = getShadowCompareMismatch({
      legacyIds,
      projectionIds,
      legacyHasNextPage: legacy.pageInfo.hasNextPage,
      projectionHasNextPage: projection.pageInfo.hasNextPage,
    });

    if (mismatch) {
      this.metricsRegistry.incrementHomeFeedShadowCompareMismatch();
      this.metricsRegistry.incrementHomeFeedShadowCompareMismatchByCategory(
        mismatch.category,
      );
      // Keep payload minimal and hashed so shadow compare logs do not expose raw ids.
      this.logger.warn("homeFeed shadow compare mismatch", {
        userHash: hashNumber(currentUserId),
        category: mismatch.category,
        firstDivergentIndex: mismatch.firstDivergentIndex,
        legacyCount: legacyIds.length,
        projectionCount: projectionIds.length,
        legacyIdHashes: hashNumbers(legacyIds),
        projectionIdHashes: hashNumbers(projectionIds),
        legacyHasNextPage: legacy.pageInfo.hasNextPage,
        projectionHasNextPage: projection.pageInfo.hasNextPage,
      });
    }
  }

  /** Queues best-effort cleanup for projection rows whose posts no longer hydrate. */
  private bestEffortCleanupMissingProjectionRows(postIds: number[]): void {
    if (!this.feedProjectionEnqueueEnabled) {
      this.metricsRegistry.incrementHomeFeedProjectionCleanupEnqueue(
        "skipped_disabled",
      );
      return;
    }

    void runBestEffort(
      this.logger,
      "error",
      `Failed to enqueue home feed cleanup for missing posts`,
      async () => {
        for (const postId of postIds) {
          try {
            await this.outboxService.enqueue({
              eventType: HOME_FEED_POST_CLEANUP_EVENT,
              aggregateType: "post",
              aggregateId: postId,
              payload: { postId },
            });
            this.metricsRegistry.incrementHomeFeedProjectionCleanupEnqueue(
              "enqueued",
            );
          } catch (error) {
            this.metricsRegistry.incrementHomeFeedProjectionCleanupEnqueue(
              "failed",
            );
            throw error;
          }
        }
      },
    );
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

function getShadowCompareMismatch(params: {
  legacyIds: number[];
  projectionIds: number[];
  legacyHasNextPage: boolean;
  projectionHasNextPage: boolean;
}): ShadowCompareMismatch | null {
  const firstDivergentIndex = getFirstDivergentIndex(
    params.legacyIds,
    params.projectionIds,
  );

  if (params.legacyHasNextPage !== params.projectionHasNextPage) {
    return {
      category: "has_next_page",
      firstDivergentIndex,
    };
  }

  if (!hasSameMembership(params.legacyIds, params.projectionIds)) {
    return {
      category: "membership",
      firstDivergentIndex,
    };
  }

  if (firstDivergentIndex !== null) {
    return {
      category: "order",
      firstDivergentIndex,
    };
  }

  return null;
}

function getFirstDivergentIndex(
  left: number[],
  right: number[],
): number | null {
  const maxLength = Math.max(left.length, right.length);

  for (let index = 0; index < maxLength; index += 1) {
    if (left[index] !== right[index]) return index;
  }

  return null;
}

function hasSameMembership(left: number[], right: number[]): boolean {
  if (left.length !== right.length) return false;

  const remaining = new Map<number, number>();

  for (const id of left) {
    remaining.set(id, (remaining.get(id) ?? 0) + 1);
  }

  for (const id of right) {
    const count = remaining.get(id);
    if (!count) return false;
    if (count === 1) {
      remaining.delete(id);
    } else {
      remaining.set(id, count - 1);
    }
  }

  return remaining.size === 0;
}

function isUserInDeterministicCohort(
  userId: number,
  sampleRate: number,
): boolean {
  if (sampleRate >= 1) return true;
  if (sampleRate <= 0) return false;

  const threshold = Math.floor(10_000 * sampleRate);
  return positiveModulo(userId, 10_000) < threshold;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function parsePositiveIntSet(value: string | undefined): Set<number> {
  if (!value) return new Set();

  const ids = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);

  return new Set(ids);
}

function hashNumbers(values: number[]): string[] {
  return values.map((value) => hashNumber(value));
}

function hashNumber(value: number): string {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

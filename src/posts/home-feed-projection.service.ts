import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "@/prisma/prisma.service";

import type { HomeFeedShadowMismatchCategory } from "@/metrics/metrics-registry.service";

import { HomeFeedEntryReason, type Prisma } from "@prisma/client";

import { AccountState } from "@/users/enums/account-state.enum";

const DEFAULT_RECONCILIATION_SAMPLE_SIZE = 25;
const DEFAULT_RECONCILIATION_PAGE_SIZE = 100;

type ReconciliationFeedSnapshot = {
  hasNextPage: boolean;
  ids: number[];
};

type ReconciliationMismatch = {
  category: HomeFeedShadowMismatchCategory;
  firstDivergentIndex: number | null;
};

export type HomeFeedProjectionReconciliationMismatch =
  ReconciliationMismatch & {
    legacyCount: number;
    legacyHasNextPage: boolean;
    legacyIds: number[];
    projectionCount: number;
    projectionHasNextPage: boolean;
    projectionIds: number[];
    userId: number;
  };

export type HomeFeedProjectionReconciliationResult = {
  matched: number;
  mismatches: HomeFeedProjectionReconciliationMismatch[];
  usersChecked: number;
};

@Injectable()
export class HomeFeedProjectionService {
  private readonly logger = new Logger(HomeFeedProjectionService.name);

  private readonly fanoutBatchSize: number;
  private readonly followerPageSize: number;
  private readonly mutesEnabled: boolean;
  private readonly retentionDays: number;
  private readonly retentionMaxItemsPerUser: number;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.fanoutBatchSize =
      configService.get<number>("FEED_PROJECTION_FANOUT_BATCH_SIZE") ?? 500;
    this.followerPageSize =
      configService.get<number>("FEED_PROJECTION_FOLLOWER_PAGE_SIZE") ?? 2_000;
    this.mutesEnabled = configService.get<boolean>("MUTES_ENABLED") ?? false;
    this.retentionDays =
      configService.get<number>("FEED_PROJECTION_RETENTION_DAYS") ?? 90;
    this.retentionMaxItemsPerUser =
      configService.get<number>(
        "FEED_PROJECTION_RETENTION_MAX_ITEMS_PER_USER",
      ) ?? 10_000;
  }

  async fanoutPost(params: {
    postId: number;
    authorId: number;
    postCreatedAt: Date;
    reason: HomeFeedEntryReason;
  }): Promise<void> {
    const startedAt = Date.now();

    // Cheap invariants at fanout-time: post exists, not removed, author active.
    const post = await this.prisma.post.findFirst({
      where: {
        id: params.postId,
        removedAt: null,
        authorId: params.authorId,
        author: {
          accountState: "ACTIVE",
        },
      },
      select: { id: true },
    });

    if (!post) {
      this.logger.warn("Skipped home feed fanout for missing/ineligible post", {
        postId: params.postId,
        authorId: params.authorId,
      });
      return;
    }

    // Always include the author themself.
    const recipientIds = new Set<number>([params.authorId]);

    // Page followers to avoid loading everything at once.
    let cursorId: number | undefined;
    for (;;) {
      const followers = await this.prisma.follow.findMany({
        where: {
          followingId: params.authorId,
        },
        orderBy: { id: "asc" },
        take: this.followerPageSize,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
        select: { followerId: true, id: true },
      });

      if (followers.length === 0) break;
      for (const row of followers) recipientIds.add(row.followerId);
      cursorId = followers[followers.length - 1]?.id;

      if (followers.length < this.followerPageSize) break;
    }

    const recipients = Array.from(recipientIds);
    let inserted = 0;

    for (let i = 0; i < recipients.length; i += this.fanoutBatchSize) {
      const batch = recipients.slice(i, i + this.fanoutBatchSize);

      const result = await this.prisma.homeFeedEntry.createMany({
        data: batch.map((userId) => ({
          userId,
          postId: params.postId,
          postCreatedAt: params.postCreatedAt,
          postAuthorId: params.authorId,
          reason: params.reason,
          hiddenAt: null,
          score: null,
        })),
        skipDuplicates: true,
      });

      inserted += result.count;
    }

    this.logger.log("Home feed fanout completed", {
      postId: params.postId,
      authorId: params.authorId,
      recipients: recipients.length,
      inserted,
      reason: params.reason,
      latencyMs: Date.now() - startedAt,
    });
  }

  async backfillAfterFollow(params: {
    followerId: number;
    followingId: number;
    now?: Date;
  }): Promise<void> {
    const now = params.now ?? new Date();
    const cutoff = new Date(
      now.getTime() - this.retentionDays * 24 * 60 * 60_000,
    );

    // Bounded by both time and count (cap).
    const posts = await this.prisma.post.findMany({
      where: {
        authorId: params.followingId,
        removedAt: null,
        createdAt: { gte: cutoff },
        author: { accountState: "ACTIVE" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: Math.min(200, this.retentionMaxItemsPerUser),
      select: { id: true, createdAt: true, authorId: true },
    });

    if (posts.length === 0) return;

    const result = await this.prisma.homeFeedEntry.createMany({
      data: posts.map((post) => ({
        userId: params.followerId,
        postId: post.id,
        postCreatedAt: post.createdAt,
        postAuthorId: post.authorId,
        reason: HomeFeedEntryReason.FOLLOWING_POST,
        hiddenAt: null,
        score: null,
      })),
      skipDuplicates: true,
    });

    this.logger.log("Home feed backfill completed", {
      followerId: params.followerId,
      followingId: params.followingId,
      candidates: posts.length,
      inserted: result.count,
    });
  }

  async bootstrapUserHomeFeed(params: { userId: number }): Promise<void> {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - this.retentionDays * 24 * 60 * 60_000,
    );

    const following = await this.prisma.follow.findMany({
      where: { followerId: params.userId },
      select: { followingId: true },
    });

    const followingIds = following.map((row) => row.followingId);
    if (followingIds.length === 0) return;

    const posts = await this.prisma.post.findMany({
      where: {
        authorId: { in: followingIds },
        removedAt: null,
        createdAt: { gte: cutoff },
        author: { accountState: "ACTIVE" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
      select: { id: true, createdAt: true, authorId: true },
    });

    if (posts.length === 0) return;

    const result = await this.prisma.homeFeedEntry.createMany({
      data: posts.map((post) => ({
        userId: params.userId,
        postId: post.id,
        postCreatedAt: post.createdAt,
        postAuthorId: post.authorId,
        reason: HomeFeedEntryReason.FOLLOWING_POST,
        hiddenAt: null,
        score: null,
      })),
      skipDuplicates: true,
    });

    this.logger.log("Home feed bootstrap completed", {
      userId: params.userId,
      followingCount: followingIds.length,
      candidates: posts.length,
      inserted: result.count,
    });
  }

  async hardDeleteByPostId(postId: number): Promise<void> {
    const result = await this.prisma.homeFeedEntry.deleteMany({
      where: { postId },
    });

    this.logger.log("Home feed entries deleted for post", {
      postId,
      deleted: result.count,
    });
  }

  async softHideByUserAndAuthor(params: {
    userId: number;
    authorId: number;
  }): Promise<void> {
    const result = await this.prisma.homeFeedEntry.updateMany({
      where: {
        userId: params.userId,
        postAuthorId: params.authorId,
        hiddenAt: null,
      },
      data: { hiddenAt: new Date() },
    });

    this.logger.log("Home feed entries soft-hidden for relationship", {
      userId: params.userId,
      authorId: params.authorId,
      hidden: result.count,
    });
  }

  async purgeExpiredEntries(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - this.retentionDays * 24 * 60 * 60_000,
    );

    // Time-based purge first.
    const timeResult = await this.prisma.homeFeedEntry.deleteMany({
      where: {
        postCreatedAt: { lt: cutoff },
      },
    });

    const countResult = await this.purgeOverCapPerUser();

    this.logger.log("Home feed purge completed", {
      retentionDays: this.retentionDays,
      retentionMaxItemsPerUser: this.retentionMaxItemsPerUser,
      deletedByTime: timeResult.count,
      deletedByUserCap: countResult.deleted,
      usersCapped: countResult.usersCapped,
    });
  }

  async reconcileSampledUsers(params?: {
    pageSize?: number;
    sampleSize?: number;
  }): Promise<HomeFeedProjectionReconciliationResult> {
    const sampleSize = clampPositiveInt(
      params?.sampleSize ?? DEFAULT_RECONCILIATION_SAMPLE_SIZE,
      DEFAULT_RECONCILIATION_SAMPLE_SIZE,
    );
    const pageSize = clampPositiveInt(
      params?.pageSize ?? DEFAULT_RECONCILIATION_PAGE_SIZE,
      DEFAULT_RECONCILIATION_PAGE_SIZE,
    );

    const userIds = await this.getReconciliationUserIds(sampleSize);
    const mismatches: HomeFeedProjectionReconciliationMismatch[] = [];

    for (const userId of userIds) {
      const [legacy, projection] = await Promise.all([
        this.getLegacyFeedSnapshot(userId, pageSize),
        this.getProjectionFeedSnapshot(userId, pageSize),
      ]);

      const mismatch = getReconciliationMismatch({
        legacyIds: legacy.ids,
        projectionIds: projection.ids,
        legacyHasNextPage: legacy.hasNextPage,
        projectionHasNextPage: projection.hasNextPage,
      });

      if (!mismatch) continue;

      const entry = {
        ...mismatch,
        userId,
        legacyCount: legacy.ids.length,
        projectionCount: projection.ids.length,
        legacyIds: legacy.ids,
        projectionIds: projection.ids,
        legacyHasNextPage: legacy.hasNextPage,
        projectionHasNextPage: projection.hasNextPage,
      };

      mismatches.push(entry);
      this.logger.warn("homeFeed projection reconciliation mismatch", entry);
    }

    const result = {
      usersChecked: userIds.length,
      matched: userIds.length - mismatches.length,
      mismatches,
    };

    this.logger.log("Home feed projection reconciliation completed", {
      usersChecked: result.usersChecked,
      matched: result.matched,
      mismatches: result.mismatches.length,
    });

    return result;
  }

  private async getReconciliationUserIds(
    sampleSize: number,
  ): Promise<number[]> {
    if (sampleSize <= 0) return [];

    const userIds = new Set<number>();
    const projectedUsers = await this.prisma.homeFeedEntry.groupBy({
      by: ["userId"],
      where: { hiddenAt: null },
      orderBy: {
        _count: {
          userId: "desc",
        },
      },
      take: sampleSize,
    });

    for (const row of projectedUsers) {
      userIds.add(row.userId);
    }

    if (userIds.size < sampleSize) {
      const activeUsers = await this.prisma.user.findMany({
        where: {
          accountState: AccountState.ACTIVE,
          ...(userIds.size > 0 ? { id: { notIn: [...userIds] } } : {}),
        },
        orderBy: { id: "asc" },
        take: sampleSize - userIds.size,
        select: { id: true },
      });

      for (const user of activeUsers) {
        userIds.add(user.id);
      }
    }

    return [...userIds];
  }

  private async getLegacyFeedSnapshot(
    userId: number,
    pageSize: number,
  ): Promise<ReconciliationFeedSnapshot> {
    const [blockedAuthorIds, mutedAuthorIds] = await Promise.all([
      this.getBlockedAuthorIds(userId),
      this.getMutedAuthorIds(userId),
    ]);

    const filters: Prisma.PostWhereInput[] = [
      { removedAt: null },
      {
        author: {
          accountState: AccountState.ACTIVE,
        },
      },
      {
        OR: [
          { authorId: userId },
          {
            author: {
              followers: {
                some: {
                  followerId: userId,
                },
              },
            },
          },
        ],
      },
    ];

    if (blockedAuthorIds.length > 0) {
      filters.push({ authorId: { notIn: blockedAuthorIds } });
    }

    if (mutedAuthorIds.length > 0) {
      filters.push({ authorId: { notIn: mutedAuthorIds } });
    }

    const rows = await this.prisma.post.findMany({
      where: { AND: filters },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: pageSize + 1,
      select: { id: true },
    });

    return {
      ids: rows.slice(0, pageSize).map((row) => row.id),
      hasNextPage: rows.length > pageSize,
    };
  }

  private async getProjectionFeedSnapshot(
    userId: number,
    pageSize: number,
  ): Promise<ReconciliationFeedSnapshot> {
    const [blockedAuthorIds, mutedAuthorIds] = await Promise.all([
      this.getBlockedAuthorIds(userId),
      this.getMutedAuthorIds(userId),
    ]);
    const entryFilters: Prisma.HomeFeedEntryWhereInput[] = [
      { userId },
      { hiddenAt: null },
    ];

    if (mutedAuthorIds.length > 0) {
      entryFilters.push({ postAuthorId: { notIn: mutedAuthorIds } });
    }

    const entries = await this.prisma.homeFeedEntry.findMany({
      where: { AND: entryFilters },
      orderBy: [{ postCreatedAt: "desc" }, { postId: "desc" }],
      take: pageSize + 1,
      select: { postId: true },
    });
    const postIds = entries.slice(0, pageSize).map((entry) => entry.postId);

    if (postIds.length === 0) {
      return {
        ids: [],
        hasNextPage: entries.length > pageSize,
      };
    }

    const postFilters: Prisma.PostWhereInput[] = [
      { id: { in: postIds } },
      { removedAt: null },
      {
        author: {
          accountState: AccountState.ACTIVE,
        },
      },
    ];

    if (blockedAuthorIds.length > 0) {
      postFilters.push({ authorId: { notIn: blockedAuthorIds } });
    }

    if (mutedAuthorIds.length > 0) {
      postFilters.push({ authorId: { notIn: mutedAuthorIds } });
    }

    const posts = await this.prisma.post.findMany({
      where: { AND: postFilters },
      select: { id: true },
    });
    const eligiblePostIds = new Set(posts.map((post) => post.id));

    return {
      ids: postIds.filter((postId) => eligiblePostIds.has(postId)),
      hasNextPage: entries.length > pageSize,
    };
  }

  private async getBlockedAuthorIds(userId: number): Promise<number[]> {
    const relatedBlocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: {
        blockerId: true,
        blockedId: true,
      },
    });

    return relatedBlocks.map((block) =>
      block.blockerId === userId ? block.blockedId : block.blockerId,
    );
  }

  private async getMutedAuthorIds(userId: number): Promise<number[]> {
    if (!this.mutesEnabled) return [];

    const rows = await this.prisma.mute.findMany({
      where: { muterId: userId },
      select: { mutedUserId: true },
    });

    return rows.map((row) => row.mutedUserId);
  }

  private async purgeOverCapPerUser(): Promise<{
    deleted: number;
    usersCapped: number;
  }> {
    if (this.retentionMaxItemsPerUser <= 0) {
      return { deleted: 0, usersCapped: 0 };
    }

    // Best-effort, bounded work per purge tick: focus only on users currently over the cap.
    const candidateUserIds = await this.prisma.homeFeedEntry.groupBy({
      by: ["userId"],
      _count: {
        userId: true,
      },
      having: {
        userId: {
          _count: {
            gt: this.retentionMaxItemsPerUser,
          },
        },
      },
      orderBy: {
        _count: {
          userId: "desc",
        },
      },
      take: 50,
    });

    let deleted = 0;
    let usersCapped = 0;

    for (const { userId } of candidateUserIds) {
      usersCapped += 1;

      // Delete oldest entries beyond the cap (chronological order).
      const toDelete = await this.prisma.homeFeedEntry.findMany({
        where: { userId },
        orderBy: [{ postCreatedAt: "desc" }, { postId: "desc" }],
        skip: this.retentionMaxItemsPerUser,
        take: 1_000,
        select: { id: true },
      });

      if (toDelete.length === 0) continue;

      const result = await this.prisma.homeFeedEntry.deleteMany({
        where: { id: { in: toDelete.map((row) => row.id) } },
      });

      deleted += result.count;
    }

    return { deleted, usersCapped };
  }
}

function getReconciliationMismatch(params: {
  legacyIds: number[];
  projectionIds: number[];
  legacyHasNextPage: boolean;
  projectionHasNextPage: boolean;
}): ReconciliationMismatch | null {
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

function clampPositiveInt(value: number, max: number): number {
  if (!Number.isFinite(value)) return max;
  return Math.max(0, Math.min(Math.floor(value), max));
}

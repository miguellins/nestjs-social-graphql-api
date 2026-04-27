import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaService } from "@/prisma/prisma.service";

import { HomeFeedEntryReason } from "@prisma/client";

@Injectable()
export class HomeFeedProjectionService {
  private readonly logger = new Logger(HomeFeedProjectionService.name);

  private readonly fanoutBatchSize: number;
  private readonly followerPageSize: number;
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

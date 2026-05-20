import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { MessageResponse } from "@/common/types/message-response.type";
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

import { FollowCacheService } from "@/follows/follow-cache.service";
import { FollowFeedTriggerService } from "@/follows/follow-feed-trigger.service";
import { FollowGuardsService } from "@/follows/follow-guards.service";
import { FollowRequestService } from "@/follows/follow-request.service";
import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";
import { FollowUserResult } from "@/follows/models/follow-user-result.model";
import {
  type SafeFollowDTO,
  SafeFollowSelect,
} from "@/follows/dto/safe-follow.dto";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";

import { AccountState } from "@/users/enums/account-state.enum";
import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";

import { Prisma } from "@prisma/client";

@Injectable()
export class FollowRelationshipService {
  private readonly logger = new Logger(FollowRelationshipService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly followCacheService: FollowCacheService,
    private readonly followFeedTriggerService: FollowFeedTriggerService,
    private readonly followGuardsService: FollowGuardsService,
    private readonly followRequestService: FollowRequestService,
    private readonly notificationTrigger: NotificationTriggerService,
  ) {}

  /** Returns cached public follow relationships with cursor pagination. */
  async findFollows(params?: {
    after?: string;
    first?: number;
    orderBy?: ChronologicalOrder;
  }): Promise<CursorPageResult<SafeFollowDTO>> {
    const take = normalizeCursorTake(params?.first);

    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderby);

    const v = await this.cacheHelper.getVersion("v:follows:list");

    const cacheKey = `follows:list:v${v}:first=${take}:after=${params?.after ?? "none"}:order=${orderby}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const rows = await this.prisma.follow.findMany({
          take: take + 1,
          where: cursorFilter,
          orderBy: [
            { createdAt: toSortDirection(orderby) },
            { id: toSortDirection(orderby) },
          ],
          select: SafeFollowSelect,
        });

        return buildCursorPage(rows, take);
      },
      30_000,
    );
  }

  /** Returns one cached public follow relationship by id. */
  async getFollow(id: number): Promise<SafeFollowDTO> {
    const cacheKey = `follow:detail:${id}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        const follow = await this.prisma.follow.findUnique({
          where: { id },

          select: SafeFollowSelect,
        });

        if (!follow) throw new NotFoundException("Follow not found");

        return follow;
      },
      30_000,
    );
  }

  /** Follows a public account or creates a private-account follow request. */
  async followUser(
    currentUserId: number,
    followingId: number,
  ): Promise<FollowUserResult> {
    const followerId = currentUserId;

    if (followerId === followingId) {
      throw new BadRequestException("You cannot follow yourself");
    }

    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: {
        id: true,
        privacySetting: true,
        accountState: true,
      },
    });

    if (!target || target.accountState === AccountState.DEACTIVATED) {
      throw new NotFoundException("User to follow not found");
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: followerId },

      select: {
        id: true,
        username: true,
        accountState: true,
      },
    });

    if (!currentUser) throw new NotFoundException("Current user not found");

    this.followGuardsService.assertActiveCurrentUser(currentUser.accountState);

    await this.followGuardsService.assertNoBlockRelationship(
      followerId,
      followingId,
      "You cannot follow this user",
    );

    const existingFollow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId,
          followingId,
        },
      },
      select: {
        id: true,
      },
    });

    if (existingFollow) {
      throw new ConflictException("You already follow this user");
    }

    if (target.privacySetting === UserPrivacySetting.PRIVATE) {
      return this.followRequestService.createPendingFollowRequest({
        followerId,
        followingId,
        actorUsername: currentUser.username,
      });
    }

    const existingRequest = await this.prisma.followRequest.findUnique({
      where: {
        requesterId_targetUserId: {
          requesterId: followerId,
          targetUserId: followingId,
        },
      },
      select: {
        id: true,
      },
    });

    let follow: SafeFollowDTO;

    try {
      follow = await this.prisma.$transaction(async (tx) => {
        const createdFollow = await tx.follow.create({
          data: { followerId, followingId },

          select: SafeFollowSelect,
        });

        if (existingRequest) {
          await tx.followRequest.update({
            where: { id: existingRequest.id },
            data: {
              status: FollowRequestStatus.APPROVED,
            },
          });
        }

        return createdFollow;
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("User to follow not found");
        }

        if (err.code === "P2002") {
          throw new ConflictException("You already follow this user");
        }
      }

      throw err;
    }

    await this.followCacheService.invalidateAfterCreateFollow(
      follow.id,
      followerId,
      followingId,
    );

    await runBestEffort(
      this.logger,
      "error",
      `Failed to create follow notification for user ${followingId}`,
      async () => {
        await this.notificationTrigger.notifyUserFollowed({
          recipientId: followingId,
          actorId: followerId,
          actorUsername: currentUser.username,
          followId: follow.id,
        });
      },
    );

    await this.followFeedTriggerService.enqueueBackfillAfterFollow({
      id: follow.id,
      followerId,
      followingId,
    });

    return {
      status: FollowRequestStatus.APPROVED,
      followId: follow.id,
      message: "User followed successfully",
    };
  }

  /** Backward-compatible helper used by older tests that still expect a direct follow object. */
  async createFollow(
    currentUserId: number,
    followingId: number,
  ): Promise<SafeFollowDTO> {
    const result = await this.followUser(currentUserId, followingId);

    if (!result.followId) {
      throw new BadRequestException("Follow request created instead of follow");
    }

    return this.getFollow(result.followId);
  }

  /** Deletes a follow by relationship id or by followed-user id for the current follower. */
  async deleteFollow(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    const ownByFollowingId = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: id,
        },
      },

      select: {
        id: true,
        followerId: true,
        followingId: true,
      },
    });

    const existing =
      ownByFollowingId ??
      (await this.prisma.follow.findUnique({
        where: { id },

        select: {
          id: true,
          followerId: true,
          followingId: true,
        },
      }));

    if (!existing) throw new NotFoundException("Follow not found");

    if (existing.followerId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to delete this follow",
      );
    }

    try {
      await this.prisma.follow.delete({
        where: { id: existing.id },
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          throw new NotFoundException("Follow not found");
        }
      }

      throw err;
    }

    await this.followCacheService.invalidateAfterDeleteFollow(existing);
    await this.followFeedTriggerService.enqueueRelationshipHideAfterDeleteFollow(
      existing,
    );

    return {
      message: "Follow deleted successfully",
    };
  }
}

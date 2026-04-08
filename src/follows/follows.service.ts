import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { decodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { runBestEffort } from "@/common/errors/run-best-effort";
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
  type SafeFollowDTO,
  SafeFollowSelect,
} from "@/follows/dto/safe-follow.dto";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly notificationTrigger: NotificationTriggerService,
  ) {}

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

  async createFollow(
    currentUserId: number,
    followingId: number,
  ): Promise<SafeFollowDTO> {
    const followerId = currentUserId;

    if (followerId === followingId) {
      throw new BadRequestException("You cannot follow yourself");
    }

    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true },
    });

    if (!target) throw new NotFoundException("User to follow not found");

    const currentUser = await this.prisma.user.findUnique({
      where: { id: followerId },

      select: {
        id: true,
        username: true,
      },
    });

    if (!currentUser) throw new NotFoundException("Current user not found");

    const blockRelationship = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: followerId,
            blockedId: followingId,
          },
          {
            blockerId: followingId,
            blockedId: followerId,
          },
        ],
      },
      select: { id: true },
    });

    if (blockRelationship) {
      throw new ForbiddenException("You cannot follow this user");
    }

    let follow: SafeFollowDTO;

    try {
      follow = await this.prisma.follow.create({
        data: { followerId, followingId },

        select: SafeFollowSelect,
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

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after creating follow ${follow.id}`,
      async () => {
        await this.cacheHelper.bumpVersion("v:follows:list");
        await this.cacheHelper.del(`user:safe:${followerId}`);
        await this.cacheHelper.del(`user:safe:${followingId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
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

    return follow;
  }

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

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after deleting follow ${existing.id}`,
      async () => {
        await this.cacheHelper.del(`follow:detail:${existing.id}`);
        await this.cacheHelper.bumpVersion("v:follows:list");
        await this.cacheHelper.del(`user:safe:${existing.followerId}`);
        await this.cacheHelper.del(`user:safe:${existing.followingId}`);
        await this.cacheHelper.bumpVersion("v:user:list");
      },
    );

    return {
      message: "Follow deleted successfully",
    };
  }
}

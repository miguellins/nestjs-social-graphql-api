import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";
import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { runBestEffort } from "@/common/errors/run-best-effort";

import {
  type SafeFollowDTO,
  SafeFollowSelect,
} from "@/follows/dto/safe-follow.dto";

import { NotificationsService } from "@/notifications/notifications.service";

import { NotificationType, Prisma } from "@prisma/client";
import { PrismaService } from "@/prisma.service";

/**
 * Service for follow workflows
 *
 * Creates, lists, and deletes follow relationships
 */

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);

  // Injects the services used by follow workflows
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Lists follows with bounded pagination and cache support
  async findFollows(params?: {
    take?: number;
    orderBy?: ChronologicalOrder;
  }): Promise<SafeFollowDTO[]> {
    const take = Math.min(
      params?.take ?? PAGINATION.DEFAULT_TAKE,
      PAGINATION.MAX_TAKE,
    );

    // Default to newest-first when no explicit chronological order is provided
    const orderby = params?.orderBy ?? ChronologicalOrder.NEWEST;

    const v = await this.cacheHelper.getVersion("v:follows:list");

    const cacheKey = `follows:list:v${v}:${take}:order=${orderby}`;

    return this.cacheHelper.getOrSet(
      cacheKey,
      async () => {
        return this.prisma.follow.findMany({
          take,

          orderBy: { createdAt: toSortDirection(orderby) },

          select: SafeFollowSelect,
        });
      },
      30_000,
    );
  }

  // Returns one follow record by id
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

  // Creates a follow relationship for the current user
  async createFollow(
    currentUserId: number,
    followingId: number,
  ): Promise<SafeFollowDTO> {
    const followerId = currentUserId;

    // Business rule: cannot follow yourself
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

    // Store the created follow outside the try block so follow-up work can reuse it
    let follow: SafeFollowDTO;

    try {
      // Rely on @@unique([followerId, followingId]) to prevent duplicates safely
      follow = await this.prisma.follow.create({
        data: { followerId, followingId },

        select: SafeFollowSelect,
      });
    } catch (err: unknown) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        // Preserve the target-user not-found response for relation races
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("User to follow not found");
        }

        // Keep duplicate follows as an explicit business conflict
        if (err.code === "P2002") {
          throw new ConflictException("You already follow this user");
        }
      }

      throw err;
    }

    // Keep cache refresh failures from masking a committed follow creation
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

    // Keep notification delivery best-effort because the follow write already succeeded
    await runBestEffort(
      this.logger,
      "error",
      `Failed to create follow notification for user ${followingId}`,
      async () => {
        await this.notificationsService.createAndPublishNotification({
          recipientId: followingId,
          actorId: followerId,
          type: NotificationType.USER_FOLLOWED,
          title: "New follower",
          body: `${currentUser.username} started following you`,
          entityId: follow.id,
        });
      },
    );

    return follow;
  }

  // Deletes a follow relationship owned by the current user
  async deleteFollow(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    // Supports both:
    // - follow relation id
    // - following user id (common "unfollow user" UX)
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
        // Preserve the local not-found response when the follow disappears mid-delete
        if (err.code === "P2025") {
          throw new NotFoundException("Follow not found");
        }
      }

      throw err;
    }

    // Keep cache refresh failures from masking a committed follow deletion
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

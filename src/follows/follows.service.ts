import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";

import { NotificationsService } from "@/notifications/notifications.service";
import { CacheHelperService } from "@/common/cache/cache-helper.service";

import { PAGINATION } from "@/common/constants/hard-cap.constants";
import {
  ChronologicalOrder,
  toSortDirection,
} from "@/common/enums/chronological-order.enum";

import { SafeFollowDTO, SafeFollowSelect } from "@/follows/dto/safe-follow.dto";

import { Prisma, NotificationType } from "@prisma/client";
import { PrismaService } from "@/prisma.service";

@Injectable()
export class FollowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

    try {
      // Rely on @@unique([followerId, followingId]) to prevent duplicates safely
      const follow = await this.prisma.follow.create({
        data: { followerId, followingId },

        select: SafeFollowSelect,
      });

      await this.cacheHelper.bumpVersion("v:follows:list");

      await this.cacheHelper.del(`user:safe:${followerId}`);
      await this.cacheHelper.del(`user:safe:${followingId}`);

      await this.cacheHelper.bumpVersion("v:user:list");

      try {
        await this.notificationsService.createAndPublishNotification({
          recipientId: followingId,
          actorId: followerId,
          type: NotificationType.USER_FOLLOWED,
          title: "New follower",
          body: `${currentUser.username} started following you`,
          entityId: follow.id,
        });
      } catch (error) {
        console.error("Failed to create follow notification", error);
      }

      return follow;
    } catch (err: unknown) {
      // Duplicate follow attempt (unique constraint)
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("User to follow not found");
        }

        if (err.code === "P2002") {
          throw new ConflictException("You already follow this user");
        }
      }

      throw new InternalServerErrorException("Failed to create follow");
    }
  }

  async deleteFollow(id: number, currentUserId: number) {
    try {
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

      await this.prisma.follow.delete({
        where: { id: existing.id },
      });

      await this.cacheHelper.del(`follow:detail:${existing.id}`);

      await this.cacheHelper.bumpVersion("v:follows:list");

      await this.cacheHelper.del(`user:safe:${existing.followerId}`);
      await this.cacheHelper.del(`user:safe:${existing.followingId}`);

      await this.cacheHelper.bumpVersion("v:user:list");

      return {
        message: "Follow deleted successfully",
      };
    } catch (err: unknown) {
      // If it was deleted between check and delete (race condition)
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2025") {
          throw new NotFoundException("Follow not found");
        }
      }

      // Keep domain errors
      if (
        err instanceof NotFoundException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }

      throw new InternalServerErrorException("Failed to delete follow");
    }
  }
}

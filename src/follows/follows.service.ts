import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
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

import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";
import { FollowUserResult } from "@/follows/models/follow-user-result.model";
import {
  FollowRequestSelect,
  type FollowRequestDTO,
} from "@/follows/dto/follow-request.dto";
import {
  type SafeFollowDTO,
  SafeFollowSelect,
} from "@/follows/dto/safe-follow.dto";

import { UserPrivacySetting } from "@/users/enums/user-privacy-setting.enum";
import { AccountState } from "@/users/enums/account-state.enum";

import { FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/follow-request-notification-delivery.event";
import { OutboxService } from "@/outbox/outbox.service";

import { NotificationTriggerService } from "@/notifications/notification-trigger.service";
import { NotificationsService } from "@/notifications/notifications.service";

import { PrismaService } from "@/prisma/prisma.service";
import { NotificationType, Prisma } from "@prisma/client";

@Injectable()
export class FollowsService {
  private readonly logger = new Logger(FollowsService.name);
  private readonly outboxFollowRequestsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly notificationTrigger: NotificationTriggerService,
    private readonly notificationsService: NotificationsService,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.outboxFollowRequestsEnabled =
      configService.get<boolean>("OUTBOX_FOLLOW_REQUESTED_ENABLED") ?? false;
  }

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

    this.assertActiveCurrentUser(currentUser.accountState);

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
      const request = await this.prisma.followRequest.findUnique({
        where: {
          requesterId_targetUserId: {
            requesterId: followerId,
            targetUserId: followingId,
          },
        },
        select: {
          id: true,
          status: true,
        },
      });

      if (request?.status === FollowRequestStatus.PENDING) {
        throw new ConflictException({
          message: "Follow request is already pending",
          code: GRAPHQL_ERROR_CODES.FOLLOW_REQUEST_PENDING,
        });
      }

      if (this.outboxFollowRequestsEnabled) {
        const followRequest = await this.prisma.$transaction(async (tx) => {
          const createdOrReopenedRequest = await tx.followRequest.upsert({
            where: {
              requesterId_targetUserId: {
                requesterId: followerId,
                targetUserId: followingId,
              },
            },
            update: {
              status: FollowRequestStatus.PENDING,
            },
            create: {
              requesterId: followerId,
              targetUserId: followingId,
              status: FollowRequestStatus.PENDING,
            },
            select: {
              id: true,
            },
          });

          const notification =
            await this.notificationsService.createNotification(
              {
                recipientId: followingId,
                actorId: followerId,
                type: NotificationType.FOLLOW_REQUESTED,
                title: "New follow request",
                body: `${currentUser.username} requested to follow you`,
                entityId: createdOrReopenedRequest.id,
              },
              tx,
            );

          if (notification) {
            await this.outboxService.enqueue(
              {
                eventType: FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT,
                aggregateType: "notification",
                aggregateId: notification.id,
                payload: {
                  notificationId: notification.id,
                  recipientId: notification.recipientId,
                  actorId: notification.actorId,
                  followRequestId: createdOrReopenedRequest.id,
                  notificationType: NotificationType.FOLLOW_REQUESTED,
                },
              },
              tx,
            );
          }

          return createdOrReopenedRequest;
        });

        return {
          status: FollowRequestStatus.PENDING,
          followRequestId: followRequest.id,
          message: "Follow request sent",
        };
      }

      const followRequest = await this.prisma.followRequest.upsert({
        where: {
          requesterId_targetUserId: {
            requesterId: followerId,
            targetUserId: followingId,
          },
        },
        update: {
          status: FollowRequestStatus.PENDING,
        },
        create: {
          requesterId: followerId,
          targetUserId: followingId,
          status: FollowRequestStatus.PENDING,
        },
        select: {
          id: true,
        },
      });

      await runBestEffort(
        this.logger,
        "error",
        `Failed to create follow request notification for user ${followingId}`,
        async () => {
          await this.notificationTrigger.notifyFollowRequested({
            recipientId: followingId,
            actorId: followerId,
            actorUsername: currentUser.username,
            followRequestId: followRequest.id,
          });
        },
      );

      return {
        status: FollowRequestStatus.PENDING,
        followRequestId: followRequest.id,
        message: "Follow request sent",
      };
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

  async findIncomingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    await this.assertActiveCurrentUserById(currentUserId);

    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);

    const rows = await this.prisma.followRequest.findMany({
      where: cursorFilter
        ? {
            AND: [
              {
                targetUserId: currentUserId,
                status: FollowRequestStatus.PENDING,
              },
              cursorFilter,
            ],
          }
        : {
            targetUserId: currentUserId,
            status: FollowRequestStatus.PENDING,
          },
      orderBy: [
        { createdAt: toSortDirection(orderBy) },
        { id: toSortDirection(orderBy) },
      ],
      take: take + 1,
      select: FollowRequestSelect,
    });

    return buildCursorPage(
      rows.map((row) => this.toFollowRequest(row)),
      take,
    );
  }

  async findOutgoingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    await this.assertActiveCurrentUserById(currentUserId);

    const take = normalizeCursorTake(params?.first);
    const orderBy = params?.orderBy ?? ChronologicalOrder.NEWEST;
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, orderBy);

    const rows = await this.prisma.followRequest.findMany({
      where: cursorFilter
        ? {
            AND: [
              {
                requesterId: currentUserId,
                status: FollowRequestStatus.PENDING,
              },
              cursorFilter,
            ],
          }
        : {
            requesterId: currentUserId,
            status: FollowRequestStatus.PENDING,
          },
      orderBy: [
        { createdAt: toSortDirection(orderBy) },
        { id: toSortDirection(orderBy) },
      ],
      take: take + 1,
      select: FollowRequestSelect,
    });

    return buildCursorPage(
      rows.map((row) => this.toFollowRequest(row)),
      take,
    );
  }

  async approveFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    await this.assertActiveCurrentUserById(currentUserId);

    const existing = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        requesterId: true,
        targetUserId: true,
        status: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Follow request not found");
    }

    if (existing.targetUserId !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to approve this follow request",
      );
    }

    if (existing.status !== FollowRequestStatus.PENDING) {
      throw new BadRequestException("Follow request is no longer pending");
    }

    const blockRelationship = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          {
            blockerId: currentUserId,
            blockedId: existing.requesterId,
          },
          {
            blockerId: existing.requesterId,
            blockedId: currentUserId,
          },
        ],
      },
      select: { id: true },
    });

    if (blockRelationship) {
      throw new ForbiddenException("You cannot approve this follow request");
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.followRequest.updateMany({
        where: {
          id: requestId,
          status: FollowRequestStatus.PENDING,
        },
        data: {
          status: FollowRequestStatus.APPROVED,
        },
      });

      if (transitioned.count !== 1) {
        throw new BadRequestException("Follow request is no longer pending");
      }

      await tx.follow.upsert({
        where: {
          followerId_followingId: {
            followerId: existing.requesterId,
            followingId: currentUserId,
          },
        },
        update: {},
        create: {
          followerId: existing.requesterId,
          followingId: currentUserId,
        },
      });

      return tx.followRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: FollowRequestSelect,
      });
    });

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after approving follow request ${requestId}`,
      async () => {
        await this.invalidateVisibilityCaches(
          existing.requesterId,
          currentUserId,
        );
      },
    );

    return this.toFollowRequest(approved);
  }

  async rejectFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    await this.assertActiveCurrentUserById(currentUserId);

    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
      select: FollowRequestSelect,
    });

    if (!request) {
      throw new NotFoundException("Follow request not found");
    }

    if (request.targetUser.id !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to reject this follow request",
      );
    }

    if (request.status !== FollowRequestStatus.PENDING) {
      throw new BadRequestException("Follow request is no longer pending");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.followRequest.updateMany({
        where: {
          id: requestId,
          status: FollowRequestStatus.PENDING,
        },
        data: {
          status: FollowRequestStatus.REJECTED,
        },
      });

      if (transitioned.count !== 1) {
        throw new BadRequestException("Follow request is no longer pending");
      }

      return tx.followRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: FollowRequestSelect,
      });
    });

    return this.toFollowRequest(updated);
  }

  async cancelFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    await this.assertActiveCurrentUserById(currentUserId);

    const request = await this.prisma.followRequest.findUnique({
      where: { id: requestId },
      select: FollowRequestSelect,
    });

    if (!request) {
      throw new NotFoundException("Follow request not found");
    }

    if (request.requester.id !== currentUserId) {
      throw new ForbiddenException(
        "You do not have permission to cancel this follow request",
      );
    }

    if (request.status !== FollowRequestStatus.PENDING) {
      throw new BadRequestException("Follow request is no longer pending");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.followRequest.updateMany({
        where: {
          id: requestId,
          status: FollowRequestStatus.PENDING,
        },
        data: {
          status: FollowRequestStatus.CANCELED,
        },
      });

      if (transitioned.count !== 1) {
        throw new BadRequestException("Follow request is no longer pending");
      }

      return tx.followRequest.findUniqueOrThrow({
        where: { id: requestId },
        select: FollowRequestSelect,
      });
    });

    return this.toFollowRequest(updated);
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
        await this.invalidateVisibilityCaches(
          existing.followerId,
          existing.followingId,
        );
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

  /** Maps one follow-request row into the GraphQL-safe request DTO shape. */
  private toFollowRequest(row: FollowRequestDTO): FollowRequestDTO {
    return {
      ...row,
      status: row.status,
    };
  }

  /** Ensures only active accounts can perform authenticated follow operations. */
  private assertActiveCurrentUser(accountState: AccountState): void {
    if (accountState === AccountState.SUSPENDED) {
      throw new UnauthorizedException({
        message: "This account is suspended",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_SUSPENDED,
      });
    }

    if (accountState === AccountState.DEACTIVATED) {
      throw new UnauthorizedException({
        message: "This account is deactivated",
        code: GRAPHQL_ERROR_CODES.ACCOUNT_DEACTIVATED,
      });
    }
  }

  /** Loads and validates the current user's account state for authenticated follow actions. */
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

    this.assertActiveCurrentUser(user.accountState);
  }

  /** Invalidates caches affected by relationship changes that change post visibility. */
  private async invalidateVisibilityCaches(
    followerId: number,
    followingId: number,
  ): Promise<void> {
    await this.cacheHelper.bumpVersion(`v:user:${followingId}:posts:list`);
    await this.cacheHelper.bumpVersion("v:posts:list");
    await this.cacheHelper.del(`user:safe:${followerId}`);
    await this.cacheHelper.del(`user:safe:${followingId}`);
    await this.cacheHelper.bumpVersion("v:user:list");
  }
}

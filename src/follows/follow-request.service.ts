import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { GRAPHQL_ERROR_CODES } from "@/common/constants/graphql-error-code.constants";
import { runBestEffort } from "@/common/errors/run-best-effort";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { type CursorPageResult } from "@/common/pagination/cursor-pagination";

import { FollowRequestReadService } from "@/follows/follow-request-read.service";
import { FollowRequestTransitionService } from "@/follows/follow-request-transition.service";
import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";
import { type FollowRequestDTO } from "@/follows/dto/follow-request.dto";

import { FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT } from "@/outbox/events/follow-request-notification-delivery.event";
import { OutboxService } from "@/outbox/outbox.service";

import { NotificationsService } from "@/notifications/notifications.service";
import { NotificationTriggerService } from "@/notifications/notification-trigger.service";

import { PrismaService } from "@/prisma/prisma.service";

import { NotificationType } from "@prisma/client";

@Injectable()
export class FollowRequestService {
  private readonly logger = new Logger(FollowRequestService.name);
  private readonly outboxFollowRequestsEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly followRequestReadService: FollowRequestReadService,
    private readonly followRequestTransitionService: FollowRequestTransitionService,
    private readonly notificationTrigger: NotificationTriggerService,
    private readonly notificationsService: NotificationsService,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.outboxFollowRequestsEnabled =
      configService.get<boolean>("OUTBOX_FOLLOW_REQUESTED_ENABLED") ?? false;
  }

  /** Creates or reopens a private-account follow request with existing notification behavior. */
  async createPendingFollowRequest(params: {
    followerId: number;
    followingId: number;
    actorUsername: string;
  }): Promise<{
    status: FollowRequestStatus;
    followRequestId: number;
    message: string;
  }> {
    const { followerId, followingId, actorUsername } = params;

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

        const notification = await this.notificationsService.createNotification(
          {
            recipientId: followingId,
            actorId: followerId,
            type: NotificationType.FOLLOW_REQUESTED,
            title: "New follow request",
            body: `${actorUsername} requested to follow you`,
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
          actorUsername,
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

  /** Delegates pending incoming follow request reads to the read collaborator. */
  async findIncomingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    return this.followRequestReadService.findIncomingFollowRequests(
      currentUserId,
      params,
    );
  }

  /** Delegates pending outgoing follow request reads to the read collaborator. */
  async findOutgoingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    return this.followRequestReadService.findOutgoingFollowRequests(
      currentUserId,
      params,
    );
  }

  /** Delegates follow-request approval to the transition collaborator. */
  async approveFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    return this.followRequestTransitionService.approveFollowRequest(
      requestId,
      currentUserId,
    );
  }

  /** Delegates follow-request rejection to the transition collaborator. */
  async rejectFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    return this.followRequestTransitionService.rejectFollowRequest(
      requestId,
      currentUserId,
    );
  }

  /** Delegates follow-request cancellation to the transition collaborator. */
  async cancelFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    return this.followRequestTransitionService.cancelFollowRequest(
      requestId,
      currentUserId,
    );
  }
}

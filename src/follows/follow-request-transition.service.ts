import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";

import { FollowCacheService } from "@/follows/follow-cache.service";
import { FollowFeedTriggerService } from "@/follows/follow-feed-trigger.service";
import { FollowGuardsService } from "@/follows/follow-guards.service";
import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";
import {
  FollowRequestSelect,
  type FollowRequestDTO,
} from "@/follows/dto/follow-request.dto";

import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class FollowRequestTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followCacheService: FollowCacheService,
    private readonly followFeedTriggerService: FollowFeedTriggerService,
    private readonly followGuardsService: FollowGuardsService,
  ) {}

  /** Approves a pending follow request through a guarded transactional transition. */
  async approveFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    await this.followGuardsService.assertActiveCurrentUserById(currentUserId);

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

    await this.followGuardsService.assertNoBlockRelationship(
      currentUserId,
      existing.requesterId,
      "You cannot approve this follow request",
    );

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

    await this.followCacheService.invalidateAfterApproveFollowRequest(
      requestId,
      existing.requesterId,
      currentUserId,
    );

    await this.followFeedTriggerService.enqueueBackfillAfterFollowRequest(
      requestId,
      existing.requesterId,
      currentUserId,
    );

    return this.toFollowRequest(approved);
  }

  /** Rejects a pending incoming follow request through a guarded transition. */
  async rejectFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    await this.followGuardsService.assertActiveCurrentUserById(currentUserId);

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

  /** Cancels a pending outgoing follow request through a guarded transition. */
  async cancelFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    await this.followGuardsService.assertActiveCurrentUserById(currentUserId);

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

  /** Maps one follow-request row into the GraphQL-safe request DTO shape. */
  private toFollowRequest(row: FollowRequestDTO): FollowRequestDTO {
    return {
      ...row,
      status: row.status,
    };
  }
}

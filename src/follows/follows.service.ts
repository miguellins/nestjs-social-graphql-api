import { Injectable } from "@nestjs/common";

import { MessageResponse } from "@/common/types/message-response.type";
import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { type CursorPageResult } from "@/common/pagination/cursor-pagination";

import { FollowRelationshipService } from "@/follows/follow-relationship.service";
import { FollowRequestService } from "@/follows/follow-request.service";
import { FollowUserResult } from "@/follows/models/follow-user-result.model";
import { type FollowRequestDTO } from "@/follows/dto/follow-request.dto";
import { type SafeFollowDTO } from "@/follows/dto/safe-follow.dto";

@Injectable()
export class FollowsService {
  constructor(
    private readonly followRelationshipService: FollowRelationshipService,
    private readonly followRequestService: FollowRequestService,
  ) {}

  /** Delegates public follow list reads to the relationship collaborator. */
  async findFollows(params?: {
    after?: string;
    first?: number;
    orderBy?: ChronologicalOrder;
  }): Promise<CursorPageResult<SafeFollowDTO>> {
    return this.followRelationshipService.findFollows(params);
  }

  /** Delegates public follow detail reads to the relationship collaborator. */
  async getFollow(id: number): Promise<SafeFollowDTO> {
    return this.followRelationshipService.getFollow(id);
  }

  /** Delegates follow or private follow-request creation to the relationship collaborator. */
  async followUser(
    currentUserId: number,
    followingId: number,
  ): Promise<FollowUserResult> {
    return this.followRelationshipService.followUser(
      currentUserId,
      followingId,
    );
  }

  /** Delegates backward-compatible direct follow creation to the relationship collaborator. */
  async createFollow(
    currentUserId: number,
    followingId: number,
  ): Promise<SafeFollowDTO> {
    return this.followRelationshipService.createFollow(
      currentUserId,
      followingId,
    );
  }

  /** Delegates incoming follow-request reads to the request collaborator. */
  async findIncomingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    return this.followRequestService.findIncomingFollowRequests(
      currentUserId,
      params,
    );
  }

  /** Delegates outgoing follow-request reads to the request collaborator. */
  async findOutgoingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    return this.followRequestService.findOutgoingFollowRequests(
      currentUserId,
      params,
    );
  }

  /** Delegates follow-request approval to the request collaborator. */
  async approveFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    return this.followRequestService.approveFollowRequest(
      requestId,
      currentUserId,
    );
  }

  /** Delegates follow-request rejection to the request collaborator. */
  async rejectFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    return this.followRequestService.rejectFollowRequest(
      requestId,
      currentUserId,
    );
  }

  /** Delegates follow-request cancellation to the request collaborator. */
  async cancelFollowRequest(
    requestId: number,
    currentUserId: number,
  ): Promise<FollowRequestDTO> {
    return this.followRequestService.cancelFollowRequest(
      requestId,
      currentUserId,
    );
  }

  /** Delegates follow deletion to the relationship collaborator. */
  async deleteFollow(
    id: number,
    currentUserId: number,
  ): Promise<MessageResponse> {
    return this.followRelationshipService.deleteFollow(id, currentUserId);
  }
}

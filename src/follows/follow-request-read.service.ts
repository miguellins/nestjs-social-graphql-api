import { Injectable } from "@nestjs/common";

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

import { FollowGuardsService } from "@/follows/follow-guards.service";
import { FollowRequestStatus } from "@/follows/enums/follow-request-status.enum";
import {
  FollowRequestSelect,
  type FollowRequestDTO,
} from "@/follows/dto/follow-request.dto";

import { PrismaService } from "@/prisma/prisma.service";

@Injectable()
export class FollowRequestReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly followGuardsService: FollowGuardsService,
  ) {}

  /** Returns pending incoming follow requests for the authenticated user. */
  async findIncomingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    await this.followGuardsService.assertActiveCurrentUserById(currentUserId);

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

  /** Returns pending outgoing follow requests for the authenticated user. */
  async findOutgoingFollowRequests(
    currentUserId: number,
    params?: {
      after?: string;
      first?: number;
      orderBy?: ChronologicalOrder;
    },
  ): Promise<CursorPageResult<FollowRequestDTO>> {
    await this.followGuardsService.assertActiveCurrentUserById(currentUserId);

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

  /** Maps one follow-request row into the GraphQL-safe request DTO shape. */
  private toFollowRequest(row: FollowRequestDTO): FollowRequestDTO {
    return {
      ...row,
      status: row.status,
    };
  }
}

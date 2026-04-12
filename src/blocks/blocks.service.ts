import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
import { MessageResponse } from "@/common/types/message-response.type";
import { runBestEffort } from "@/common/errors/run-best-effort";
import {
  decodeChronoCursor,
  encodeChronoCursor,
} from "@/common/pagination/chrono-cursor";
import {
  buildChronologicalCursorFilter,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { SafeUserSelect, type SafeUserDTO } from "@/users/dto/safe-user.dto";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type BlockPaginationParams = {
  after?: string;
  first?: number;
};

@Injectable()
export class BlocksService {
  private readonly logger = new Logger(BlocksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
  ) {}

  async blockUser(
    currentUserId: number,
    targetUserId: number,
  ): Promise<MessageResponse> {
    if (currentUserId === targetUserId) {
      throw new BadRequestException("You cannot block yourself");
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("User not found");
    }

    const existingFollowIds = await this.prisma.follow.findMany({
      where: {
        OR: [
          {
            followerId: currentUserId,
            followingId: targetUserId,
          },
          {
            followerId: targetUserId,
            followingId: currentUserId,
          },
        ],
      },
      select: { id: true },
    });

    const existingFollowRequestIds = await this.prisma.followRequest.findMany({
      where: {
        OR: [
          {
            requesterId: currentUserId,
            targetUserId: targetUserId,
          },
          {
            requesterId: targetUserId,
            targetUserId: currentUserId,
          },
        ],
      },
      select: { id: true },
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.userBlock.upsert({
          where: {
            blockerId_blockedId: {
              blockerId: currentUserId,
              blockedId: targetUserId,
            },
          },
          update: {},
          create: {
            blockerId: currentUserId,
            blockedId: targetUserId,
          },
        });

        await tx.follow.deleteMany({
          where: {
            OR: [
              {
                followerId: currentUserId,
                followingId: targetUserId,
              },
              {
                followerId: targetUserId,
                followingId: currentUserId,
              },
            ],
          },
        });

        await tx.followRequest.deleteMany({
          where: {
            OR: [
              {
                requesterId: currentUserId,
                targetUserId: targetUserId,
              },
              {
                requesterId: targetUserId,
                targetUserId: currentUserId,
              },
            ],
          },
        });
      });
    } catch (err) {
      this.throwBlockPersistenceFailure(err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after blocking user ${targetUserId}`,
      async () => {
        for (const follow of existingFollowIds) {
          await this.cacheHelper.del(`follow:detail:${follow.id}`);
        }

        if (existingFollowIds.length > 0) {
          await this.cacheHelper.bumpVersion("v:follows:list");
          await this.cacheHelper.bumpVersion("v:user:list");
        }

        if (existingFollowRequestIds.length > 0) {
          await this.cacheHelper.bumpVersion(
            `v:user:${currentUserId}:posts:list`,
          );
          await this.cacheHelper.bumpVersion(
            `v:user:${targetUserId}:posts:list`,
          );
          await this.cacheHelper.bumpVersion("v:posts:list");
        }

        await this.cacheHelper.del(`user:safe:${currentUserId}`);
        await this.cacheHelper.del(`user:safe:${targetUserId}`);
      },
    );

    return {
      message: "User blocked successfully",
    };
  }

  async unblockUser(
    currentUserId: number,
    targetUserId: number,
  ): Promise<MessageResponse> {
    if (currentUserId === targetUserId) {
      throw new BadRequestException("You cannot unblock yourself");
    }

    try {
      await this.prisma.userBlock.deleteMany({
        where: {
          blockerId: currentUserId,
          blockedId: targetUserId,
        },
      });
    } catch (err) {
      this.throwUnexpectedPersistenceFailure("unblock user", err);
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after unblocking user ${targetUserId}`,
      async () => {
        await this.cacheHelper.del(`user:safe:${currentUserId}`);
        await this.cacheHelper.del(`user:safe:${targetUserId}`);
      },
    );

    return {
      message: "User unblocked successfully",
    };
  }

  async findMyBlockedUsers(
    currentUserId: number,
    params?: BlockPaginationParams,
  ): Promise<CursorPageResult<SafeUserDTO>> {
    const take = normalizeCursorTake(params?.first);
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, undefined);

    const rows = await this.prisma.userBlock.findMany({
      where: {
        blockerId: currentUserId,
        ...(cursorFilter
          ? { AND: [{ blockerId: currentUserId }, cursorFilter] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: {
        createdAt: true,
        id: true,
        blocked: {
          select: SafeUserSelect,
        },
      },
    });

    const hasNextPage = rows.length > take;
    const items = (hasNextPage ? rows.slice(0, take) : rows).map(
      (row) => row.blocked,
    );
    const lastRow = (hasNextPage ? rows.slice(0, take) : rows).at(-1);

    return {
      items,
      pageInfo: {
        endCursor: lastRow
          ? encodeChronoCursor({
              createdAt: lastRow.createdAt,
              id: lastRow.id,
            })
          : null,
        hasNextPage,
      },
    };
  }

  private throwBlockPersistenceFailure(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2003" || err.code === "P2025") {
        throw new NotFoundException("User not found");
      }
    }

    this.throwUnexpectedPersistenceFailure("block user", err);
  }

  private throwUnexpectedPersistenceFailure(
    action: "block user" | "unblock user",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}

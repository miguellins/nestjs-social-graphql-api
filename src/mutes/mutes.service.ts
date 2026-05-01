import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { CacheHelperService } from "@/common/cache/cache-helper.service";
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

import { HOME_FEED_RELATIONSHIP_HIDE_EVENT } from "@/outbox/events/home-feed-cleanup.event";
import { OutboxService } from "@/outbox/outbox.service";

import { SafeUserSelect, type SafeUserDTO } from "@/users/dto/safe-user.dto";

import { PrismaService } from "@/prisma/prisma.service";
import { Prisma } from "@prisma/client";

type MutePaginationParams = {
  after?: string;
  first?: number;
};

type MuteEdgeDTO = {
  id: number;
  muterId: number;
  mutedUserId: number;
  createdAt: Date;
};

@Injectable()
export class MutesService {
  private readonly logger = new Logger(MutesService.name);
  private readonly mutesEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.mutesEnabled = configService.get<boolean>("MUTES_ENABLED") ?? false;
  }

  isEnabled(): boolean {
    return this.mutesEnabled;
  }

  assertEnabled(): void {
    if (!this.mutesEnabled) {
      // Hide the feature behind a flag without leaking deployment state.
      throw new NotFoundException("Not found");
    }
  }

  async muteUser(muterId: number, mutedUserId: number): Promise<MuteEdgeDTO> {
    this.assertEnabled();

    if (muterId === mutedUserId) {
      throw new BadRequestException("You cannot mute yourself");
    }

    const target = await this.prisma.user.findUnique({
      where: { id: mutedUserId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("User not found");
    }

    let edge: MuteEdgeDTO;
    let created = false;

    try {
      edge = await this.prisma.mute.create({
        data: {
          muterId,
          mutedUserId,
        },
        select: {
          id: true,
          muterId: true,
          mutedUserId: true,
          createdAt: true,
        },
      });
      created = true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          // Idempotent success: return the existing edge.
          const existing = await this.prisma.mute.findUnique({
            where: {
              muterId_mutedUserId: {
                muterId,
                mutedUserId,
              },
            },
            select: {
              id: true,
              muterId: true,
              mutedUserId: true,
              createdAt: true,
            },
          });

          if (existing) {
            edge = existing;
          } else {
            this.throwUnexpectedPersistenceFailure("mute user", err);
          }
        } else if (err.code === "P2003" || err.code === "P2025") {
          throw new NotFoundException("User not found");
        } else {
          this.throwUnexpectedPersistenceFailure("mute user", err);
        }
      } else {
        this.throwUnexpectedPersistenceFailure("mute user", err);
      }
    }

    void runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after muting user ${mutedUserId} by user ${muterId}`,
      async () => {
        await this.cacheHelper.bumpVersion(
          this.getMutedUsersListVersionKey(muterId),
        );
        await this.cacheHelper.bumpVersion(`v:user:${muterId}:bookmarks:list`);
      },
    );

    if (created) {
      void runBestEffort(
        this.logger,
        "error",
        `Failed to enqueue home feed relationship hide for user ${muterId} -> author ${mutedUserId}`,
        async () => {
          await this.outboxService.enqueue({
            eventType: HOME_FEED_RELATIONSHIP_HIDE_EVENT,
            aggregateType: "user",
            aggregateId: muterId,
            payload: {
              userId: muterId,
              authorId: mutedUserId,
            },
          });
        },
      );
    }

    return edge;
  }

  async unmuteUser(muterId: number, mutedUserId: number): Promise<boolean> {
    this.assertEnabled();

    if (muterId === mutedUserId) {
      throw new BadRequestException("You cannot unmute yourself");
    }

    try {
      await this.prisma.mute.deleteMany({
        where: {
          muterId,
          mutedUserId,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return true;
      }

      this.throwUnexpectedPersistenceFailure("unmute user", err);
    }

    void runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after unmuting user ${mutedUserId} by user ${muterId}`,
      async () => {
        await this.cacheHelper.bumpVersion(
          this.getMutedUsersListVersionKey(muterId),
        );
        await this.cacheHelper.bumpVersion(`v:user:${muterId}:bookmarks:list`);
      },
    );

    return true;
  }

  async findMyMutedUsers(
    currentUserId: number,
    params?: MutePaginationParams,
  ): Promise<CursorPageResult<SafeUserDTO>> {
    this.assertEnabled();

    const take = normalizeCursorTake(params?.first);
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, undefined);

    const rows = await this.prisma.mute.findMany({
      where: {
        muterId: currentUserId,
        ...(cursorFilter
          ? { AND: [{ muterId: currentUserId }, cursorFilter] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: {
        id: true,
        createdAt: true,
        mutedUser: {
          select: SafeUserSelect,
        },
      },
    });

    const hasNextPage = rows.length > take;
    const items = (hasNextPage ? rows.slice(0, take) : rows).map(
      (row) => row.mutedUser,
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

  async isMuted(muterId: number, mutedUserId: number): Promise<boolean> {
    if (!this.mutesEnabled) return false;
    if (muterId === mutedUserId) return false;

    const row = await this.prisma.mute.findUnique({
      where: {
        muterId_mutedUserId: {
          muterId,
          mutedUserId,
        },
      },
      select: { id: true },
    });

    return Boolean(row);
  }

  async getMutedUserIds(muterId: number): Promise<number[]> {
    if (!this.mutesEnabled) return [];

    const rows = await this.prisma.mute.findMany({
      where: { muterId },
      select: { mutedUserId: true },
    });

    return rows.map((row) => row.mutedUserId);
  }

  /** Builds the per-user muted-users list version cache key. */
  private getMutedUsersListVersionKey(userId: number): string {
    return `v:user:${userId}:mutes:list`;
  }

  /** Logs unexpected mute persistence failures and returns a sanitized API error. */
  private throwUnexpectedPersistenceFailure(
    action: "mute user" | "unmute user",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}

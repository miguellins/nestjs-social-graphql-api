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

import { ALL_MUTE_SCOPES, MuteScope } from "@/mutes/enums/mute-scope.enum";
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
  scopes: MuteScope[];
  createdAt: Date;
  mutedUser?: SafeUserDTO;
};

@Injectable()
export class MutesService {
  private readonly logger = new Logger(MutesService.name);
  private readonly mutesEnabled: boolean;
  private readonly muteScopesEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheHelper: CacheHelperService,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.mutesEnabled = configService.get<boolean>("MUTES_ENABLED") ?? false;
    this.muteScopesEnabled =
      configService.get<boolean>("MUTE_SCOPES_ENABLED") ?? false;
  }

  /** Returns whether the mutes feature is available through public APIs. */
  isEnabled(): boolean {
    return this.mutesEnabled;
  }

  /** Hides mute APIs when the master feature flag is disabled. */
  assertEnabled(): void {
    if (!this.mutesEnabled) {
      // Hide the feature behind a flag without leaking deployment state.
      throw new NotFoundException("Not found");
    }
  }

  /** Creates or replaces a mute relationship and enqueues feed hiding when FEED is newly active. */
  async muteUser(
    muterId: number,
    mutedUserId: number,
    scopes?: MuteScope[],
  ): Promise<MuteEdgeDTO> {
    this.assertEnabled();

    if (muterId === mutedUserId) {
      throw new BadRequestException("You cannot mute yourself");
    }

    const nextScopes = this.normalizeRequestedScopes(scopes);

    const target = await this.prisma.user.findUnique({
      where: { id: mutedUserId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException("User not found");
    }

    await this.assertNoBlockRelationship(muterId, mutedUserId);

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
        scopes: true,
        createdAt: true,
      },
    });

    let edge: MuteEdgeDTO;
    const existingScopes = existing
      ? this.parseStoredScopes(existing.scopes)
      : [];
    const shouldHideFeed =
      nextScopes.includes(MuteScope.FEED) &&
      !existingScopes.includes(MuteScope.FEED);

    try {
      if (existing) {
        edge = this.toMuteEdge(
          await this.prisma.mute.update({
            where: { id: existing.id },
            data: { scopes: nextScopes },
            select: {
              id: true,
              muterId: true,
              mutedUserId: true,
              scopes: true,
              createdAt: true,
            },
          }),
        );
      } else {
        edge = this.toMuteEdge(
          await this.prisma.mute.create({
            data: {
              muterId,
              mutedUserId,
              scopes: nextScopes,
            },
            select: {
              id: true,
              muterId: true,
              mutedUserId: true,
              scopes: true,
              createdAt: true,
            },
          }),
        );
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          const racedExisting = await this.prisma.mute.findUnique({
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
              scopes: true,
              createdAt: true,
            },
          });

          if (racedExisting) {
            edge = this.toMuteEdge(
              await this.prisma.mute.update({
                where: { id: racedExisting.id },
                data: { scopes: nextScopes },
                select: {
                  id: true,
                  muterId: true,
                  mutedUserId: true,
                  scopes: true,
                  createdAt: true,
                },
              }),
            );
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

    await this.invalidateMuteWriteCaches(muterId, mutedUserId, "muting");
    this.enqueueRelationshipHideIfNeeded(muterId, mutedUserId, shouldHideFeed);

    return edge;
  }

  /** Replaces the scope set on an existing mute relationship. */
  async updateMuteScopes(
    muterId: number,
    mutedUserId: number,
    scopes: MuteScope[],
  ): Promise<MuteEdgeDTO> {
    this.assertEnabled();

    if (muterId === mutedUserId) {
      throw new BadRequestException("You cannot mute yourself");
    }

    const nextScopes = this.normalizeRequestedScopes(scopes);
    const existing = await this.prisma.mute.findUnique({
      where: {
        muterId_mutedUserId: {
          muterId,
          mutedUserId,
        },
      },
      select: {
        id: true,
        scopes: true,
      },
    });

    if (!existing) {
      throw new NotFoundException("Mute not found");
    }

    await this.assertNoBlockRelationship(muterId, mutedUserId);

    const shouldHideFeed =
      nextScopes.includes(MuteScope.FEED) &&
      !this.parseStoredScopes(existing.scopes).includes(MuteScope.FEED);

    let edge: MuteEdgeDTO;

    try {
      edge = this.toMuteEdge(
        await this.prisma.mute.update({
          where: { id: existing.id },
          data: { scopes: nextScopes },
          select: {
            id: true,
            muterId: true,
            mutedUserId: true,
            scopes: true,
            createdAt: true,
          },
        }),
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        throw new NotFoundException("Mute not found");
      }

      this.throwUnexpectedPersistenceFailure("update mute scopes", err);
    }

    await this.invalidateMuteWriteCaches(muterId, mutedUserId, "updating");
    this.enqueueRelationshipHideIfNeeded(muterId, mutedUserId, shouldHideFeed);

    return edge;
  }

  /** Deletes a mute relationship if present. */
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

    await this.invalidateMuteWriteCaches(muterId, mutedUserId, "unmuting");

    return true;
  }

  /** Returns a cursor page of mute edges with safe muted-user profiles. */
  async findMyMutedUsers(
    currentUserId: number,
    params?: MutePaginationParams,
  ): Promise<CursorPageResult<MuteEdgeDTO>> {
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
        muterId: true,
        mutedUserId: true,
        scopes: true,
        createdAt: true,
        mutedUser: {
          select: SafeUserSelect,
        },
      },
    });

    const hasNextPage = rows.length > take;
    const items = (hasNextPage ? rows.slice(0, take) : rows).map((row) =>
      this.toMuteEdge(row),
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

  /** Returns whether any active mute scope exists for the relationship. */
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
      select: { scopes: true },
    });

    return Boolean(row && this.parseStoredScopes(row.scopes).length > 0);
  }

  /** Returns whether the requested scope is active for the relationship. */
  async isMutedForScope(
    muterId: number,
    mutedUserId: number,
    scope: MuteScope,
  ): Promise<boolean> {
    if (!this.mutesEnabled) return false;
    if (muterId === mutedUserId) return false;

    const row = await this.prisma.mute.findUnique({
      where: {
        muterId_mutedUserId: {
          muterId,
          mutedUserId,
        },
      },
      select: { scopes: true },
    });

    return Boolean(row && this.parseStoredScopes(row.scopes).includes(scope));
  }

  /** Returns muted user ids with any active scope for legacy GraphQL compatibility. */
  async getMutedUserIds(muterId: number): Promise<number[]> {
    if (!this.mutesEnabled) return [];

    const rows = await this.prisma.mute.findMany({
      where: { muterId },
      select: { mutedUserId: true, scopes: true },
    });

    return rows
      .filter((row) => this.parseStoredScopes(row.scopes).length > 0)
      .map((row) => row.mutedUserId);
  }

  /** Returns muted user ids where the requested scope is active. */
  async getMutedUserIdsForScope(
    muterId: number,
    scope: MuteScope,
  ): Promise<number[]> {
    if (!this.mutesEnabled) return [];

    const rows = await this.prisma.mute.findMany({
      where: { muterId },
      select: { mutedUserId: true, scopes: true },
    });

    return rows
      .filter((row) => this.parseStoredScopes(row.scopes).includes(scope))
      .map((row) => row.mutedUserId);
  }

  /** Builds the per-user muted-users list version cache key. */
  private getMutedUsersListVersionKey(userId: number): string {
    return `v:user:${userId}:mutes:list`;
  }

  /** Converts a raw Prisma mute row into the public edge shape. */
  private toMuteEdge(row: {
    id: number;
    muterId: number;
    mutedUserId: number;
    scopes: Prisma.JsonValue;
    createdAt: Date;
    mutedUser?: SafeUserDTO;
  }): MuteEdgeDTO {
    return {
      id: row.id,
      muterId: row.muterId,
      mutedUserId: row.mutedUserId,
      scopes: this.parseStoredScopes(row.scopes),
      createdAt: row.createdAt,
      ...(row.mutedUser ? { mutedUser: row.mutedUser } : {}),
    };
  }

  /** Normalizes requested scopes and applies rollback behavior when scoped mutes are disabled. */
  private normalizeRequestedScopes(scopes?: MuteScope[]): MuteScope[] {
    if (!this.muteScopesEnabled) return [...ALL_MUTE_SCOPES];

    const requested = scopes ?? [...ALL_MUTE_SCOPES];
    const validScopes = new Set(Object.values(MuteScope));

    if (!requested.every((scope) => validScopes.has(scope))) {
      throw new BadRequestException("Invalid mute scope");
    }

    const unique = [...new Set(requested)];

    if (unique.length === 0) {
      throw new BadRequestException("At least one mute scope is required");
    }

    return unique;
  }

  /** Parses stored JSON scopes and fails closed to a full mute when data is invalid. */
  private parseStoredScopes(scopes: Prisma.JsonValue | undefined): MuteScope[] {
    if (!this.muteScopesEnabled) return [...ALL_MUTE_SCOPES];
    if (!Array.isArray(scopes)) return [...ALL_MUTE_SCOPES];

    const parsed = scopes.filter((scope): scope is MuteScope =>
      Object.values(MuteScope).includes(scope as MuteScope),
    );

    if (parsed.length !== scopes.length || parsed.length === 0) {
      return [...ALL_MUTE_SCOPES];
    }

    return [...new Set(parsed)];
  }

  /** Rejects mute writes when either user has blocked the other. */
  private async assertNoBlockRelationship(
    muterId: number,
    mutedUserId: number,
  ): Promise<void> {
    const block = await this.prisma.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: muterId, blockedId: mutedUserId },
          { blockerId: mutedUserId, blockedId: muterId },
        ],
      },
      select: { id: true },
    });

    if (block) {
      throw new BadRequestException("You cannot mute a blocked user");
    }
  }

  /** Invalidates read caches affected by a mute write. */
  private async invalidateMuteWriteCaches(
    muterId: number,
    mutedUserId: number,
    action: "muting" | "unmuting" | "updating",
  ): Promise<void> {
    await runBestEffort(
      this.logger,
      "error",
      `Failed to invalidate caches after ${action} user ${mutedUserId} by user ${muterId}`,
      async () => {
        await this.cacheHelper.bumpVersion(
          this.getMutedUsersListVersionKey(muterId),
        );
        await this.cacheHelper.bumpVersion(`v:user:${muterId}:bookmarks:list`);
      },
    );
  }

  /** Enqueues projected feed cleanup when FEED scope becomes active. */
  private enqueueRelationshipHideIfNeeded(
    muterId: number,
    mutedUserId: number,
    shouldHideFeed: boolean,
  ): void {
    if (!shouldHideFeed) return;

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

  /** Logs unexpected mute persistence failures and returns a sanitized API error. */
  private throwUnexpectedPersistenceFailure(
    action: "mute user" | "unmute user" | "update mute scopes",
    err: unknown,
  ): never {
    this.logger.error(
      `Unexpected persistence failure while trying to ${action}`,
      err instanceof Error ? err.stack : undefined,
    );

    throw new InternalServerErrorException(`Failed to ${action}`);
  }
}

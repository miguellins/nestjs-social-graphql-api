import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import {
  decodeChronoCursor,
  encodeChronoCursor,
} from "@/common/pagination/chrono-cursor";
import {
  buildChronologicalCursorFilter,
  normalizeCursorTake,
  type CursorPageResult,
} from "@/common/pagination/cursor-pagination";

import { SilencedActorEdge } from "@/notifications/models/silenced-actor-edge.model";

import { SafeUserSelect, type SafeUserDTO } from "@/users/dto/safe-user.dto";

import { PrismaService } from "@/prisma/prisma.service";

type ActorSilencePaginationParams = {
  after?: string;
  first?: number;
};

type ActorPreferenceRow = {
  id: number;
  userId: number;
  actorId: number;
  notificationsEnabled: boolean;
  createdAt: Date;
  actor?: SafeUserDTO;
};

/** Coordinates per-actor notification silence preferences. */
@Injectable()
export class NotificationActorPreferencesService {
  private readonly mutesEnabled: boolean;
  private readonly actorSilenceEnabled: boolean;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.mutesEnabled = configService.get<boolean>("MUTES_ENABLED") ?? false;
    this.actorSilenceEnabled =
      configService.get<boolean>("NOTIFICATION_ACTOR_SILENCE_ENABLED") ?? false;
  }

  /** Hides actor-silence APIs unless both rollout flags are enabled. */
  assertEnabled(): void {
    if (!this.mutesEnabled || !this.actorSilenceEnabled) {
      throw new NotFoundException("Not found");
    }
  }

  /** Persists a disabled notification preference for one actor. */
  async silenceActor(
    userId: number,
    actorId: number,
  ): Promise<SilencedActorEdge> {
    this.assertEnabled();

    if (userId === actorId) {
      throw new BadRequestException("You cannot silence yourself");
    }

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true },
    });

    if (!actor) {
      throw new NotFoundException("User not found");
    }

    const row = await this.prisma.notificationActorPreference.upsert({
      where: {
        userId_actorId: {
          userId,
          actorId,
        },
      },
      create: {
        userId,
        actorId,
        notificationsEnabled: false,
      },
      update: {
        notificationsEnabled: false,
      },
      select: this.getActorPreferenceSelect(),
    });

    return this.toSilencedActorEdge(row);
  }

  /** Removes the per-actor silence row when present. */
  async unsilenceActor(userId: number, actorId: number): Promise<boolean> {
    this.assertEnabled();

    if (userId === actorId) {
      throw new BadRequestException("You cannot unsilence yourself");
    }

    await this.prisma.notificationActorPreference.deleteMany({
      where: {
        userId,
        actorId,
      },
    });

    return true;
  }

  /** Returns a page of actors currently silenced by the user. */
  async findMySilencedActors(
    userId: number,
    params?: ActorSilencePaginationParams,
  ): Promise<CursorPageResult<SilencedActorEdge>> {
    this.assertEnabled();

    const take = normalizeCursorTake(params?.first);
    const cursor = params?.after ? decodeChronoCursor(params.after) : undefined;
    const cursorFilter = buildChronologicalCursorFilter(cursor, undefined);

    const rows = await this.prisma.notificationActorPreference.findMany({
      where: {
        userId,
        notificationsEnabled: false,
        ...(cursorFilter
          ? { AND: [{ userId }, { notificationsEnabled: false }, cursorFilter] }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: this.getActorPreferenceSelect(),
    });

    const pageRows = rows.length > take ? rows.slice(0, take) : rows;
    const lastRow = pageRows.at(-1);

    return {
      items: pageRows.map((row) => this.toSilencedActorEdge(row)),
      pageInfo: {
        endCursor: lastRow
          ? encodeChronoCursor({
              createdAt: lastRow.createdAt,
              id: lastRow.id,
            })
          : null,
        hasNextPage: rows.length > take,
      },
    };
  }

  /** Returns whether the recipient silenced notifications from the actor. */
  async isActorSilenced(userId: number, actorId: number): Promise<boolean> {
    if (!this.mutesEnabled || !this.actorSilenceEnabled) return false;
    if (userId === actorId) return false;

    const row = await this.prisma.notificationActorPreference.findUnique({
      where: {
        userId_actorId: {
          userId,
          actorId,
        },
      },
      select: {
        notificationsEnabled: true,
      },
    });

    return row?.notificationsEnabled === false;
  }

  /** Selects only public actor preference fields and safe actor profile data. */
  private getActorPreferenceSelect() {
    return {
      id: true,
      userId: true,
      actorId: true,
      notificationsEnabled: true,
      createdAt: true,
      actor: {
        select: SafeUserSelect,
      },
    };
  }

  /** Converts a raw actor preference row into the public edge shape. */
  private toSilencedActorEdge(row: ActorPreferenceRow): SilencedActorEdge {
    return {
      id: row.id,
      userId: row.userId,
      actorId: row.actorId,
      notificationsEnabled: row.notificationsEnabled,
      createdAt: row.createdAt,
      ...(row.actor ? { actor: row.actor } : {}),
    };
  }
}

import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";

import type {
  EnqueueOutboxEventInput,
  OutboxSummary,
} from "@/outbox/outbox.types";

import { PrismaService } from "@/prisma/prisma.service";
import {
  OutboxEventStatus,
  type OutboxEvent,
  type PrismaClient,
} from "@prisma/client";

type OutboxWriteClient = Pick<PrismaClient, "outboxEvent">;

const OUTBOX_CLAIM_CANDIDATE_MULTIPLIER = 3;

/** Persists, claims, and tracks durable outbox rows used by background workers. */
@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async enqueue(
    input: EnqueueOutboxEventInput,
    client: OutboxWriteClient = this.prisma,
  ): Promise<OutboxEvent> {
    return client.outboxEvent.create({
      data: {
        eventType: input.eventType,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        payload: input.payload,
        availableAt: input.availableAt ?? new Date(),
      },
    });
  }

  async claimPendingBatch(limit: number): Promise<OutboxEvent[]> {
    if (limit <= 0) return [];

    const now = new Date();
    const candidates = await this.prisma.outboxEvent.findMany({
      where: {
        status: OutboxEventStatus.PENDING,
        availableAt: {
          lte: now,
        },
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      take: limit * OUTBOX_CLAIM_CANDIDATE_MULTIPLIER,
    });

    const claimed: OutboxEvent[] = [];

    for (const candidate of candidates) {
      if (claimed.length >= limit) break;

      const result = await this.prisma.outboxEvent.updateMany({
        where: {
          id: candidate.id,
          status: OutboxEventStatus.PENDING,
          availableAt: {
            lte: now,
          },
        },
        data: {
          status: OutboxEventStatus.PROCESSING,
          attemptCount: {
            increment: 1,
          },
        },
      });

      if (result.count !== 1) continue;

      const row = await this.prisma.outboxEvent.findUnique({
        where: { id: candidate.id },
      });

      if (row) {
        claimed.push(row);
      }
    }

    return claimed;
  }

  async markProcessed(id: number): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  async rescheduleRetry(
    id: number,
    errorMessage: string,
    availableAt: Date,
  ): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.PENDING,
        availableAt,
        lastError: errorMessage,
      },
    });
  }

  async markFailed(id: number, errorMessage: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: {
        status: OutboxEventStatus.FAILED,
        lastError: errorMessage,
      },
    });
  }

  async purgeExpiredEvents(): Promise<void> {
    const processedRetentionHours =
      this.configService.get<number>("OUTBOX_PROCESSED_RETENTION_HOURS") ?? 24;
    const failedRetentionHours =
      this.configService.get<number>("OUTBOX_FAILED_RETENTION_HOURS") ?? 168;

    const processedCutoff = new Date(
      Date.now() - processedRetentionHours * 60 * 60_000,
    );
    const failedCutoff = new Date(
      Date.now() - failedRetentionHours * 60 * 60_000,
    );

    await this.prisma.$transaction([
      this.prisma.outboxEvent.deleteMany({
        where: {
          status: OutboxEventStatus.PROCESSED,
          processedAt: {
            lt: processedCutoff,
          },
        },
      }),
      this.prisma.outboxEvent.deleteMany({
        where: {
          status: OutboxEventStatus.FAILED,
          updatedAt: {
            lt: failedCutoff,
          },
        },
      }),
    ]);
  }

  async getSummary(): Promise<OutboxSummary> {
    const workerEnabled =
      this.configService.get<boolean>("OUTBOX_ENABLED") ?? false;
    const commentReplyOutboxEnabled =
      this.configService.get<boolean>("OUTBOX_COMMENT_REPLIED_ENABLED") ??
      false;
    const followRequestOutboxEnabled =
      this.configService.get<boolean>("OUTBOX_FOLLOW_REQUESTED_ENABLED") ??
      false;
    const [pendingCount, failedCount, oldestPending] = await Promise.all([
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.PENDING },
      }),
      this.prisma.outboxEvent.count({
        where: { status: OutboxEventStatus.FAILED },
      }),
      this.prisma.outboxEvent.findFirst({
        where: { status: OutboxEventStatus.PENDING },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        select: {
          availableAt: true,
        },
      }),
    ]);

    return {
      enabled:
        workerEnabled ||
        commentReplyOutboxEnabled ||
        followRequestOutboxEnabled,
      pendingCount,
      failedCount,
      oldestPendingAgeMs: oldestPending
        ? Math.max(0, Date.now() - oldestPending.availableAt.getTime())
        : null,
    };
  }
}

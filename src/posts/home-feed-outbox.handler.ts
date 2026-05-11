import { Injectable, Logger } from "@nestjs/common";

import type { HomeFeedFollowBackfillPayload } from "@/outbox/events/home-feed-follow-backfill.event";
import type { HomeFeedUserBootstrapPayload } from "@/outbox/events/home-feed-user-bootstrap.event";
import { HOME_FEED_FOLLOW_BACKFILL_EVENT } from "@/outbox/events/home-feed-follow-backfill.event";
import { HOME_FEED_USER_BOOTSTRAP_EVENT } from "@/outbox/events/home-feed-user-bootstrap.event";
import type { HomeFeedPostFanoutPayload } from "@/outbox/events/home-feed-post-fanout.event";
import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import { OutboxPermanentError } from "@/outbox/outbox.errors";
import {
  HOME_FEED_POST_CLEANUP_EVENT,
  HOME_FEED_RELATIONSHIP_HIDE_EVENT,
  type HomeFeedRelationshipHidePayload,
  HomeFeedPostCleanupPayload,
} from "@/outbox/events/home-feed-cleanup.event";

import { HomeFeedProjectionService } from "@/posts/home-feed-projection.service";

import { HomeFeedEntryReason } from "@prisma/client";
import type { OutboxEvent } from "@prisma/client";

@Injectable()
export class HomeFeedOutboxHandler {
  private readonly logger = new Logger(HomeFeedOutboxHandler.name);

  constructor(private readonly homeFeedProjection: HomeFeedProjectionService) {}

  /** Reports whether this handler owns the outbox event type. */
  supports(eventType: string): boolean {
    return (
      eventType === HOME_FEED_POST_FANOUT_EVENT ||
      eventType === HOME_FEED_FOLLOW_BACKFILL_EVENT ||
      eventType === HOME_FEED_USER_BOOTSTRAP_EVENT ||
      eventType === HOME_FEED_POST_CLEANUP_EVENT ||
      eventType === HOME_FEED_RELATIONSHIP_HIDE_EVENT
    );
  }

  /** Dispatches one validated home-feed projection event to projection work. */
  async handle(event: OutboxEvent): Promise<void> {
    switch (event.eventType) {
      case HOME_FEED_POST_FANOUT_EVENT:
        return this.handlePostFanout(event);
      case HOME_FEED_FOLLOW_BACKFILL_EVENT:
        return this.handleFollowBackfill(event);
      case HOME_FEED_USER_BOOTSTRAP_EVENT:
        return this.handleUserBootstrap(event);
      case HOME_FEED_POST_CLEANUP_EVENT:
        return this.handlePostCleanup(event);
      case HOME_FEED_RELATIONSHIP_HIDE_EVENT:
        return this.handleRelationshipHide(event);
      default:
        throw new OutboxPermanentError(
          `Unsupported feed outbox event type ${event.eventType}`,
        );
    }
  }

  /** Validates and handles post fanout events. */
  private async handlePostFanout(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as HomeFeedPostFanoutPayload;

    if (!payload?.postId || !payload?.authorId || !payload?.postCreatedAt) {
      throw new OutboxPermanentError("Invalid post fanout payload");
    }
    this.warnUnknownPayloadKeys(event, payload, [
      "postId",
      "authorId",
      "postCreatedAt",
      "reason",
    ]);

    const postCreatedAt = new Date(payload.postCreatedAt);
    if (Number.isNaN(postCreatedAt.getTime())) {
      throw new OutboxPermanentError("Invalid post fanout timestamp");
    }

    const reason =
      payload.reason === "SELF_POST"
        ? HomeFeedEntryReason.SELF_POST
        : HomeFeedEntryReason.FOLLOWING_POST;

    await this.homeFeedProjection.fanoutPost({
      postId: payload.postId,
      authorId: payload.authorId,
      postCreatedAt,
      reason,
    });
  }

  /** Validates and handles follow backfill events. */
  private async handleFollowBackfill(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as HomeFeedFollowBackfillPayload;

    if (!payload?.followerId || !payload?.followingId) {
      throw new OutboxPermanentError("Invalid follow backfill payload");
    }
    this.warnUnknownPayloadKeys(event, payload, ["followerId", "followingId"]);

    await this.homeFeedProjection.backfillAfterFollow({
      followerId: payload.followerId,
      followingId: payload.followingId,
    });
  }

  /** Validates and handles user bootstrap events. */
  private async handleUserBootstrap(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as HomeFeedUserBootstrapPayload;

    if (!payload?.userId) {
      throw new OutboxPermanentError("Invalid user bootstrap payload");
    }
    this.warnUnknownPayloadKeys(event, payload, ["userId"]);

    await this.homeFeedProjection.bootstrapUserHomeFeed({
      userId: payload.userId,
    });
  }

  /** Validates and handles post cleanup events. */
  private async handlePostCleanup(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as HomeFeedPostCleanupPayload;

    if (!payload?.postId) {
      throw new OutboxPermanentError("Invalid post cleanup payload");
    }
    this.warnUnknownPayloadKeys(event, payload, ["postId"]);

    await this.homeFeedProjection.hardDeleteByPostId(payload.postId);
  }

  /** Validates and handles relationship hide events. */
  private async handleRelationshipHide(event: OutboxEvent): Promise<void> {
    const payload = event.payload as unknown as HomeFeedRelationshipHidePayload;

    if (!payload?.userId || !payload?.authorId) {
      throw new OutboxPermanentError("Invalid relationship hide payload");
    }
    this.warnUnknownPayloadKeys(event, payload, ["userId", "authorId"]);

    await this.homeFeedProjection.softHideByUserAndAuthor({
      userId: payload.userId,
      authorId: payload.authorId,
    });
  }

  /** Logs unexpected payload fields without failing otherwise valid events. */
  private warnUnknownPayloadKeys(
    event: OutboxEvent,
    payload: unknown,
    allowedKeys: string[],
  ): void {
    if (!isRecord(payload)) return;

    const unknownKeys = Object.keys(payload).filter(
      (key) => !allowedKeys.includes(key),
    );
    if (unknownKeys.length === 0) return;

    this.logger.warn("Ignoring unknown home feed outbox payload fields", {
      eventId: event.id,
      eventType: event.eventType,
      unknownKeys,
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

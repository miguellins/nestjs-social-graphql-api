import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { runBestEffort } from "@/common/errors/run-best-effort";

import { HOME_FEED_FOLLOW_BACKFILL_EVENT } from "@/outbox/events/home-feed-follow-backfill.event";
import { HOME_FEED_RELATIONSHIP_HIDE_EVENT } from "@/outbox/events/home-feed-cleanup.event";
import { OutboxService } from "@/outbox/outbox.service";

@Injectable()
export class FollowFeedTriggerService {
  private readonly logger = new Logger(FollowFeedTriggerService.name);
  private readonly feedProjectionEnqueueEnabled: boolean;
  private readonly feedProjectionBackfillEnabled: boolean;

  constructor(
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.feedProjectionEnqueueEnabled =
      configService.get<boolean>("FEED_PROJECTION_ENQUEUE_ENABLED") ?? false;
    this.feedProjectionBackfillEnabled =
      configService.get<boolean>("FEED_PROJECTION_BACKFILL_ENABLED") ?? false;
  }

  /** Enqueues home-feed backfill after a direct follow when rollout flags allow it. */
  async enqueueBackfillAfterFollow(follow: {
    id: number;
    followerId: number;
    followingId: number;
  }): Promise<void> {
    if (
      !this.feedProjectionEnqueueEnabled ||
      !this.feedProjectionBackfillEnabled
    ) {
      return;
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to enqueue home feed backfill after follow ${follow.id}`,
      async () => {
        await this.outboxService.enqueue({
          eventType: HOME_FEED_FOLLOW_BACKFILL_EVENT,
          aggregateType: "follow",
          aggregateId: follow.id,
          payload: {
            followerId: follow.followerId,
            followingId: follow.followingId,
          },
        });
      },
    );
  }

  /** Enqueues home-feed backfill after follow-request approval when rollout flags allow it. */
  async enqueueBackfillAfterFollowRequest(
    requestId: number,
    followerId: number,
    followingId: number,
  ): Promise<void> {
    if (
      !this.feedProjectionEnqueueEnabled ||
      !this.feedProjectionBackfillEnabled
    ) {
      return;
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to enqueue home feed backfill after approving follow request ${requestId}`,
      async () => {
        await this.outboxService.enqueue({
          eventType: HOME_FEED_FOLLOW_BACKFILL_EVENT,
          aggregateType: "followRequest",
          aggregateId: requestId,
          payload: {
            followerId,
            followingId,
          },
        });
      },
    );
  }

  /** Enqueues relationship-hide cleanup after unfollow when rollout flags allow it. */
  async enqueueRelationshipHideAfterDeleteFollow(follow: {
    id: number;
    followerId: number;
    followingId: number;
  }): Promise<void> {
    if (!this.feedProjectionEnqueueEnabled) {
      return;
    }

    await runBestEffort(
      this.logger,
      "error",
      `Failed to enqueue home feed relationship hide after deleting follow ${follow.id}`,
      async () => {
        await this.outboxService.enqueue({
          eventType: HOME_FEED_RELATIONSHIP_HIDE_EVENT,
          aggregateType: "follow",
          aggregateId: follow.id,
          payload: {
            userId: follow.followerId,
            authorId: follow.followingId,
          },
        });
      },
    );
  }
}

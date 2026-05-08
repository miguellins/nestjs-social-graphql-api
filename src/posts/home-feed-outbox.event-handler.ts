import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { HOME_FEED_FOLLOW_BACKFILL_EVENT } from "@/outbox/events/home-feed-follow-backfill.event";
import { HOME_FEED_USER_BOOTSTRAP_EVENT } from "@/outbox/events/home-feed-user-bootstrap.event";
import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import {
  HOME_FEED_POST_CLEANUP_EVENT,
  HOME_FEED_RELATIONSHIP_HIDE_EVENT,
} from "@/outbox/events/home-feed-cleanup.event";
import {
  type OutboxDurableEventHandler,
  type OutboxPreDispatchOutcome,
} from "@/outbox/outbox-handler.types";
import { OutboxService } from "@/outbox/outbox.service";

import { HomeFeedOutboxHandler } from "@/posts/home-feed-outbox.handler";

import type { OutboxEvent } from "@prisma/client";

/** Adapts home-feed projection work to the durable outbox handler registry. */
@Injectable()
export class HomeFeedOutboxEventHandler implements OutboxDurableEventHandler {
  readonly eventTypes = [
    HOME_FEED_POST_FANOUT_EVENT,
    HOME_FEED_FOLLOW_BACKFILL_EVENT,
    HOME_FEED_USER_BOOTSTRAP_EVENT,
    HOME_FEED_POST_CLEANUP_EVENT,
    HOME_FEED_RELATIONSHIP_HIDE_EVENT,
  ] as const;

  private readonly feedProjectionWorkerEnabled: boolean;

  constructor(
    private readonly homeFeedOutboxHandler: HomeFeedOutboxHandler,
    private readonly outboxService: OutboxService,
    configService: ConfigService,
  ) {
    this.feedProjectionWorkerEnabled =
      configService.get<boolean>("FEED_PROJECTION_WORKER_ENABLED") ?? false;
  }

  /** Reschedules feed events without burning retries when the projection worker is disabled. */
  async preDispatch(event: OutboxEvent): Promise<OutboxPreDispatchOutcome> {
    if (this.feedProjectionWorkerEnabled) {
      return "continue";
    }

    await this.outboxService.rescheduleRetry(
      event.id,
      "Feed projection worker disabled",
      new Date(Date.now() + 60_000),
    );

    return "retry_scheduled";
  }

  /** Delegates feed projection events to the existing feature handler. */
  async handle(event: OutboxEvent): Promise<void> {
    await this.homeFeedOutboxHandler.handle(event);
  }
}

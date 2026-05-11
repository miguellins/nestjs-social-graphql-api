import { Logger } from "@nestjs/common";
import { HomeFeedEntryReason, OutboxEventStatus } from "@prisma/client";

import { HOME_FEED_USER_BOOTSTRAP_EVENT } from "@/outbox/events/home-feed-user-bootstrap.event";
import { HOME_FEED_POST_FANOUT_EVENT } from "@/outbox/events/home-feed-post-fanout.event";
import { HOME_FEED_RELATIONSHIP_HIDE_EVENT } from "@/outbox/events/home-feed-cleanup.event";
import { OutboxPermanentError } from "@/outbox/outbox.errors";
import { HomeFeedOutboxHandler } from "@/posts/home-feed-outbox.handler";
import { HomeFeedProjectionService } from "@/posts/home-feed-projection.service";

import type { OutboxEvent } from "@prisma/client";

describe("HomeFeedOutboxHandler", () => {
  const homeFeedProjectionMock = {
    bootstrapUserHomeFeed: jest.fn(),
    fanoutPost: jest.fn(),
    backfillAfterFollow: jest.fn(),
    hardDeleteByPostId: jest.fn(),
    softHideByUserAndAuthor: jest.fn(),
  } as unknown as jest.Mocked<HomeFeedProjectionService>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ignores unknown optional payload fields with an observability log", async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const handler = new HomeFeedOutboxHandler(homeFeedProjectionMock);

    await handler.handle(
      makeOutboxEvent({
        eventType: HOME_FEED_USER_BOOTSTRAP_EVENT,
        payload: { userId: 7, extra: "ignored" },
      }),
    );

    expect(
      homeFeedProjectionMock.bootstrapUserHomeFeed.mock.calls[0]?.[0],
    ).toEqual({
      userId: 7,
    });
    expect(loggerSpy).toHaveBeenCalledWith(
      "Ignoring unknown home feed outbox payload fields",
      {
        eventId: 1,
        eventType: HOME_FEED_USER_BOOTSTRAP_EVENT,
        unknownKeys: ["extra"],
      },
    );
  });

  it("rejects missing required identifiers as permanent errors", async () => {
    const handler = new HomeFeedOutboxHandler(homeFeedProjectionMock);

    await expect(
      handler.handle(
        makeOutboxEvent({
          eventType: HOME_FEED_USER_BOOTSTRAP_EVENT,
          payload: { extra: "ignored" },
        }),
      ),
    ).rejects.toBeInstanceOf(OutboxPermanentError);

    expect(
      homeFeedProjectionMock.bootstrapUserHomeFeed.mock.calls,
    ).toHaveLength(0);
  });

  it("soft-hides projection rows for relationship hide events", async () => {
    const handler = new HomeFeedOutboxHandler(homeFeedProjectionMock);

    await handler.handle(
      makeOutboxEvent({
        eventType: HOME_FEED_RELATIONSHIP_HIDE_EVENT,
        payload: { userId: 1, authorId: 3 },
      }),
    );

    expect(
      homeFeedProjectionMock.softHideByUserAndAuthor.mock.calls[0]?.[0],
    ).toEqual({
      userId: 1,
      authorId: 3,
    });
  });

  it("rejects invalid post fanout timestamps as permanent errors", async () => {
    const handler = new HomeFeedOutboxHandler(homeFeedProjectionMock);

    await expect(
      handler.handle(
        makeOutboxEvent({
          eventType: HOME_FEED_POST_FANOUT_EVENT,
          payload: {
            postId: 10,
            authorId: 3,
            postCreatedAt: "not-a-date",
          },
        }),
      ),
    ).rejects.toBeInstanceOf(OutboxPermanentError);

    expect(homeFeedProjectionMock.fanoutPost.mock.calls).toHaveLength(0);
  });

  it("dispatches valid post fanout timestamps to projection work", async () => {
    const handler = new HomeFeedOutboxHandler(homeFeedProjectionMock);

    await handler.handle(
      makeOutboxEvent({
        eventType: HOME_FEED_POST_FANOUT_EVENT,
        payload: {
          postId: 10,
          authorId: 3,
          postCreatedAt: "2026-04-10T00:00:00.000Z",
          reason: "SELF_POST",
        },
      }),
    );

    expect(homeFeedProjectionMock.fanoutPost.mock.calls[0]?.[0]).toEqual({
      postId: 10,
      authorId: 3,
      postCreatedAt: new Date("2026-04-10T00:00:00.000Z"),
      reason: HomeFeedEntryReason.SELF_POST,
    });
  });
});

function makeOutboxEvent(overrides: Partial<OutboxEvent>): OutboxEvent {
  return {
    id: 1,
    eventType: "event",
    aggregateType: "user",
    aggregateId: 7,
    payload: {},
    status: OutboxEventStatus.PROCESSING,
    availableAt: new Date("2026-04-01T00:00:00.000Z"),
    attemptCount: 1,
    processedAt: null,
    lastError: null,
    createdAt: new Date("2026-04-01T00:00:00.000Z"),
    updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    ...overrides,
  };
}

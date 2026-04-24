import { Test } from "@nestjs/testing";

import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";
import { NotificationsService } from "@/notifications/notifications.service";
import { OutboxPermanentError } from "@/outbox/outbox.errors";

describe("NotificationOutboxHandler", () => {
  const notificationsServiceMock = {
    publishPersistedNotificationIfNeeded: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("publishes one persisted comment-reply notification when available", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationOutboxHandler,
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();
    const handler = moduleRef.get(NotificationOutboxHandler);

    notificationsServiceMock.publishPersistedNotificationIfNeeded.mockResolvedValue(
      "delivered",
    );

    await expect(
      handler.handleCommentReplyDelivery({
        payload: {
          notificationId: 9,
        },
      } as never),
    ).resolves.toBeUndefined();
  });

  it("marks a missing notification as a permanent handler failure", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationOutboxHandler,
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();
    const handler = moduleRef.get(NotificationOutboxHandler);

    notificationsServiceMock.publishPersistedNotificationIfNeeded.mockResolvedValue(
      "missing",
    );

    await expect(
      handler.handleCommentReplyDelivery({
        payload: {
          notificationId: 9,
        },
      } as never),
    ).rejects.toBeInstanceOf(OutboxPermanentError);
  });

  it("publishes one persisted follow-request notification when available", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationOutboxHandler,
        {
          provide: NotificationsService,
          useValue: notificationsServiceMock,
        },
      ],
    }).compile();
    const handler = moduleRef.get(NotificationOutboxHandler);

    notificationsServiceMock.publishPersistedNotificationIfNeeded.mockResolvedValue(
      "already-delivered",
    );

    await expect(
      handler.handleFollowRequestDelivery({
        payload: {
          notificationId: 11,
        },
      } as never),
    ).resolves.toBeUndefined();
  });
});

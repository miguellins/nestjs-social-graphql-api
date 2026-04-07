import { Test, TestingModule } from "@nestjs/testing";

import { Logger } from "@nestjs/common";

import { NotificationType } from "@prisma/client";

import { ChronologicalOrder } from "@/common/enums/chronological-order.enum";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { encodeChronoCursor } from "@/common/pagination/chrono-cursor";
import { NotificationDeliveryService } from "@/notifications/notification-delivery.service";

import { NotificationReadStatus } from "@/notifications/enums/notification-read-status.enum";

import { NotificationSelect } from "@/notifications/dto/safe-notification.dto";

import { PrismaService } from "@/prisma/prisma.service";

import { NotificationsService } from "./notifications.service";

describe("NotificationsService", () => {
  let service: NotificationsService;
  let moduleRef: TestingModule;

  type NotificationUpdateManyArgs = {
    where:
      | { id: number; recipientId: number }
      | { recipientId: number; isRead: boolean };
    data: { isRead: boolean; readAt: Date };
  };

  const prismaMock = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn<
        Promise<{ count: number }>,
        [NotificationUpdateManyArgs]
      >(),
    },
  };

  const notificationDeliveryMock = {
    publishNotificationReceived: jest.fn<
      Promise<void>,
      [Record<string, unknown>]
    >(),
  };

  const mockNotification = {
    id: 1,
    type: NotificationType.USER_FOLLOWED,
    title: "New follower",
    body: "john started following you",
    isRead: false,
    readAt: null,
    entityId: 10,
    actorId: 2,
    recipientId: 1,
    createdAt: new Date("2026-03-10T10:00:00.000Z"),
    updatedAt: new Date("2026-03-10T10:00:00.000Z"),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: NotificationDeliveryService,
          useValue: notificationDeliveryMock,
        },
      ],
    }).compile();

    service = moduleRef.get<NotificationsService>(NotificationsService);
  });

  afterEach(async () => {
    await moduleRef?.close();
  });

  describe("createAndPublishNotification", () => {
    it("should return null and not create notification for self-action", async () => {
      const input = {
        recipientId: 1,
        actorId: 1,
        type: NotificationType.USER_FOLLOWED,
        title: "New follower",
        body: "self action",
        entityId: 99,
      };

      const result = await service.createAndPublishNotification(input);

      expect(result).toBeNull();
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
      expect(
        notificationDeliveryMock.publishNotificationReceived,
      ).not.toHaveBeenCalled();
    });

    it("should create and publish notification", async () => {
      const input = {
        recipientId: 1,
        actorId: 2,
        type: NotificationType.USER_FOLLOWED,
        title: "New follower",
        body: "john started following you",
        entityId: 10,
      };

      prismaMock.notification.create.mockResolvedValue(mockNotification);

      notificationDeliveryMock.publishNotificationReceived.mockResolvedValue(
        undefined,
      );

      const result = await service.createAndPublishNotification(input);

      expect(prismaMock.notification.create).toHaveBeenCalledWith({
        data: {
          recipientId: input.recipientId,
          actorId: input.actorId,
          type: input.type,
          title: input.title,
          body: input.body,
          entityId: input.entityId,
        },
        select: NotificationSelect,
      });

      expect(
        notificationDeliveryMock.publishNotificationReceived,
      ).toHaveBeenCalledWith(mockNotification);

      expect(result).toEqual(mockNotification);
    });

    it("should return notification even if publish fails", async () => {
      const input = {
        recipientId: 1,
        actorId: 2,
        type: NotificationType.USER_FOLLOWED,
        title: "New follower",
        body: "john started following you",
        entityId: 10,
      };

      prismaMock.notification.create.mockResolvedValue(mockNotification);

      notificationDeliveryMock.publishNotificationReceived.mockRejectedValue(
        new Error("PubSub failed"),
      );

      const loggerSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);

      const result = await service.createAndPublishNotification(input);

      expect(result).toEqual(mockNotification);
      expect(loggerSpy).toHaveBeenCalledWith(
        "Failed to publish notification subscription event",
        expect.any(String),
      );
    });

    it("throws before touching Prisma when the payload is invalid", async () => {
      await expect(
        service.createAndPublishNotification({
          recipientId: 1,
          actorId: 2,
          type: NotificationType.USER_FOLLOWED,
          title: "   ",
        }),
      ).rejects.toThrow();

      expect(prismaMock.notification.create).not.toHaveBeenCalled();
    });
  });

  describe("findMyNotifications", () => {
    it("should use default first when params are not provided", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.findMyNotifications(1);

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGINATION.DEFAULT_TAKE + 1,
        select: NotificationSelect,
      });

      expect(result.items).toEqual([mockNotification]);
      expect(result.pageInfo.hasNextPage).toBe(false);
      expect(result.pageInfo.endCursor).toEqual(expect.any(String));
    });

    it("should use provided first when within max limit", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.findMyNotifications(1, { first: 5 });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: NotificationSelect,
      });

      expect(result.items).toEqual([mockNotification]);
    });

    it("should cap first at PAGINATION.MAX_TAKE", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      await service.findMyNotifications(1, {
        first: PAGINATION.MAX_TAKE + 100,
      });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGINATION.MAX_TAKE + 1,
        select: NotificationSelect,
      });
    });

    it("should filter only read notifications when status is READ", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      await service.findMyNotifications(
        1,
        { first: 5 },
        NotificationReadStatus.READ,
      );

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
          isRead: true,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: NotificationSelect,
      });
    });

    it("should filter only unread notifications when status is UNREAD", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      await service.findMyNotifications(
        1,
        { first: 5 },
        NotificationReadStatus.UNREAD,
      );

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
          isRead: false,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: NotificationSelect,
      });
    });

    it("should apply cursor filtering and return a page", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-01T12:00:00.000Z"),
        id: 99,
      });

      const result = await service.findMyNotifications(
        1,
        { first: 5, after },
        NotificationReadStatus.ALL,
      );

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              recipientId: 1,
            },
            {
              OR: [
                { createdAt: { lt: new Date("2026-04-01T12:00:00.000Z") } },
                {
                  createdAt: new Date("2026-04-01T12:00:00.000Z"),
                  id: { lt: 99 },
                },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 6,
        select: NotificationSelect,
      });

      expect(result.items).toEqual([mockNotification]);
      expect(result.pageInfo.hasNextPage).toBe(false);
    });

    it("throws for an invalid cursor", async () => {
      await expect(
        service.findMyNotifications(1, { first: 5, after: "%%%invalid%%%" }),
      ).rejects.toThrow("Invalid cursor");

      expect(prismaMock.notification.findMany).not.toHaveBeenCalled();
    });

    it("uses ascending tie-breaker filtering for OLDEST notification pagination", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);
      const after = encodeChronoCursor({
        createdAt: new Date("2026-04-01T12:00:00.000Z"),
        id: 99,
      });

      await service.findMyNotifications(
        1,
        { first: 5, after, orderBy: ChronologicalOrder.OLDEST },
        NotificationReadStatus.ALL,
      );

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              recipientId: 1,
            },
            {
              OR: [
                { createdAt: { gt: new Date("2026-04-01T12:00:00.000Z") } },
                {
                  createdAt: new Date("2026-04-01T12:00:00.000Z"),
                  id: { gt: 99 },
                },
              ],
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 6,
        select: NotificationSelect,
      });
    });
  });

  describe("getUnreadCount", () => {
    it("should return unread count", async () => {
      prismaMock.notification.count.mockResolvedValue(3);

      const result = await service.getUnreadCount(1);

      expect(prismaMock.notification.count).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
          isRead: false,
        },
      });

      expect(result).toBe(3);
    });
  });

  describe("markAsRead", () => {
    it("should return a success response when notification is updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead(10, 1);

      const firstCall = prismaMock.notification.updateMany.mock.calls.at(0);
      expect(firstCall).toBeDefined();
      if (!firstCall) throw new Error("updateMany was not called");

      const [updateArgs] = firstCall;

      expect(updateArgs.where).toEqual({
        id: 10,
        recipientId: 1,
      });
      expect(updateArgs.data.isRead).toBe(true);
      expect(updateArgs.data.readAt).toBeInstanceOf(Date);

      expect(result).toEqual({ message: "Notification marked as read" });
    });

    it("should return a not found response when notification is not updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAsRead(10, 1);

      expect(result).toEqual({ message: "Notification not found" });
    });
  });

  describe("markAllAsRead", () => {
    it("should return a success response when notifications are updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markAllAsRead(1);

      const firstCall = prismaMock.notification.updateMany.mock.calls.at(0);
      expect(firstCall).toBeDefined();
      if (!firstCall) throw new Error("updateMany was not called");

      const [updateArgs] = firstCall;

      expect(updateArgs.where).toEqual({
        recipientId: 1,
        isRead: false,
      });
      expect(updateArgs.data.isRead).toBe(true);
      expect(updateArgs.data.readAt).toBeInstanceOf(Date);

      expect(result).toEqual({ message: "All notifications marked as read" });
    });

    it("should return the same success response when no notifications are updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllAsRead(1);

      expect(result).toEqual({ message: "All notifications marked as read" });
    });
  });
});

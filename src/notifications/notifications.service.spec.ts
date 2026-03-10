import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { NotificationsService } from "./notifications.service";

import { pubSub } from "@/graphql/pubsub";
import { PAGINATION } from "@/common/constants/hard-cap.constants";
import { PrismaService } from "@/prisma.service";
import { NotificationSelect } from "@/notifications/dto/notifications.dto";

describe("NotificationsService", () => {
  let service: NotificationsService;

  const prismaMock = {
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockNotification = {
    id: 1,
    type: "USER_FOLLOWED",
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  describe("createAndPublishNotification", () => {
    it("should return null and not create notification for self-action", async () => {
      const input = {
        recipientId: 1,
        actorId: 1,
        type: "USER_FOLLOWED",
        title: "New follower",
        body: "self action",
        entityId: 99,
      };

      const publishSpy = jest
        .spyOn(pubSub, "publish")
        .mockResolvedValue(true as never);

      const result = await service.createAndPublishNotification(input);

      expect(result).toBeNull();
      expect(prismaMock.notification.create).not.toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });

    it("should create and publish notification", async () => {
      const input = {
        recipientId: 1,
        actorId: 2,
        type: "USER_FOLLOWED",
        title: "New follower",
        body: "john started following you",
        entityId: 10,
      };

      prismaMock.notification.create.mockResolvedValue(mockNotification);

      const publishSpy = jest
        .spyOn(pubSub, "publish")
        .mockResolvedValue(true as never);

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

      expect(publishSpy).toHaveBeenCalledWith("notificationReceived", {
        notificationReceived: mockNotification,
      });

      expect(result).toEqual(mockNotification);
    });

    it("should return notification even if publish fails", async () => {
      const input = {
        recipientId: 1,
        actorId: 2,
        type: "USER_FOLLOWED",
        title: "New follower",
        body: "john started following you",
        entityId: 10,
      };

      prismaMock.notification.create.mockResolvedValue(mockNotification);

      jest
        .spyOn(pubSub, "publish")
        .mockRejectedValue(new Error("PubSub failed"));

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
  });

  describe("findMyNotifications", () => {
    it("should use default take when params are not provided", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.findMyNotifications(1);

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: PAGINATION.DEFAULT_TAKE,
        select: NotificationSelect,
      });

      expect(result).toEqual([mockNotification]);
    });

    it("should use provided take when within max limit", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      const result = await service.findMyNotifications(1, { take: 5 });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
        select: NotificationSelect,
      });

      expect(result).toEqual([mockNotification]);
    });

    it("should cap take at PAGINATION.MAX_TAKE", async () => {
      prismaMock.notification.findMany.mockResolvedValue([mockNotification]);

      await service.findMyNotifications(1, {
        take: PAGINATION.MAX_TAKE + 100,
      });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: PAGINATION.MAX_TAKE,
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
    it("should return true when notification is updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead(10, 1);

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: {
          id: 10,
          recipientId: 1,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });

      expect(result).toBe(true);
    });

    it("should return false when notification is not updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAsRead(10, 1);

      expect(result).toBe(false);
    });
  });

  describe("markAllAsRead", () => {
    it("should return true when notifications are updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.markAllAsRead(1);

      expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
        where: {
          recipientId: 1,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });

      expect(result).toBe(true);
    });

    it("should return false when no notifications are updated", async () => {
      prismaMock.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllAsRead(1);

      expect(result).toBe(false);
    });
  });
});
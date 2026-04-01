import { NotificationType } from "@prisma/client";

import type { Prisma } from "@prisma/client";

/** Defines the safe notification shape used by services. */
export type SafeNotificationDTO = {
  id: number;
  type: NotificationType;
  title: string;
  body: string | null;
  isRead: boolean;
  readAt: Date | null;
  entityId: number | null;
  actorId: number;
  recipientId: number;
  createdAt: Date;
  updatedAt: Date;

  actor: {
    id: number;
    username: string;
    name: string;
  };
};

/** Defines the Prisma select shape that matches the safe notification DTO exactly. */
export const NotificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  isRead: true,
  readAt: true,
  entityId: true,
  actorId: true,
  recipientId: true,
  createdAt: true,
  updatedAt: true,

  actor: {
    select: {
      id: true,
      username: true,
      name: true,
    },
  },
} satisfies Prisma.NotificationSelect;

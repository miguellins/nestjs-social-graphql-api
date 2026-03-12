import { Prisma, NotificationType } from "@prisma/client";

/**
 * Safe Notification DTO
 *
 * What it does:
 * - Defines the exact notification shape returned by the service layer
 * - Includes only public-safe relational actor preview fields
 * - Creates a strict contract between Prisma query result and API mapping
 *
 * Why it exists:
 * - Avoids returning raw Prisma Notification model objects
 * - Prevents accidental inclusion of unrelated/internal fields
 * - Keeps notification payloads predictable for clients
 *
 * Design philosophy:
 * - Services return DTOs, not database models
 * - Select and DTO must stay aligned for type-safe responses
 */

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

/**
 * Prisma select shape that matches SafeNotificationDTO exactly
 *
 * Why:
 * - Guarantees the DB result matches the DTO
 * - Prevents accidental field leakage
 * - Gives full type-safety via satisfies
 */

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

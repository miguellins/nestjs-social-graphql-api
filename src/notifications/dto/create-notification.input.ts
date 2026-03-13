import { NotificationType } from "@prisma/client";

/**
 * Internal input contract for creating a notification event
 *
 * What it does:
 * - Defines the exact payload required by NotificationsService
 * - Standardizes notification creation across modules (likes, follows, etc.)
 * - Keeps service signatures explicit and stable as the app evolves
 *
 * Why this is not a GraphQL InputType:
 * - GraphQL clients never submit this shape directly
 * - It is created internally by backend services when they trigger notifications
 * - A plain TypeScript type is enough because this is not part of the public schema
 *
 * Why it exists:
 * - Prevents ad-hoc inline object shapes from spreading across the codebase
 * - Makes future extensions easier (metadata, channels, priorities)
 * - Improves readability and reuse for event-producing modules
 */

export type CreateNotificationInput = {
  recipientId: number;
  actorId: number;
  type: NotificationType;
  title: string;
  body?: string;
  entityId?: number;
};

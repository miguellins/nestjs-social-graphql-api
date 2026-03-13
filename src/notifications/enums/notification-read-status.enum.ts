import { registerEnumType } from "@nestjs/graphql";

/**
 * GraphQL enum used to filter notifications by read state
 *
 * Supports returning:
 * - all notifications
 * - only read notifications
 * - only unread notifications
 */

export enum NotificationReadStatus {
  ALL = "ALL",
  READ = "READ",
  UNREAD = "UNREAD",
}

registerEnumType(NotificationReadStatus, {
  name: "NotificationReadStatus",
  description: "Filter notifications by read state",
});

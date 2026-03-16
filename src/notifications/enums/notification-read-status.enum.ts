import { registerEnumType } from "@nestjs/graphql";

/**
 * GraphQL enum for notification read status
 *
 * Defines the filters used in notification queries
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

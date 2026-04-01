import { registerEnumType } from "@nestjs/graphql";

/** Enum for filtering notifications by read state. */
export enum NotificationReadStatus {
  ALL = "ALL",
  READ = "READ",
  UNREAD = "UNREAD",
}

registerEnumType(NotificationReadStatus, {
  name: "NotificationReadStatus",
  description: "Filter notifications by read state",
});

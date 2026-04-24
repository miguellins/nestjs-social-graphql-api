/** Names the durable outbox event that delivers a persisted comment reply notification. */
export const COMMENT_REPLY_NOTIFICATION_DELIVERY_EVENT =
  "notification.commentReply.deliver";

/** Carries the stable identifiers needed to deliver a persisted comment reply notification. */
export type CommentReplyNotificationDeliveryPayload = {
  notificationId: number;
  recipientId: number;
  actorId: number;
  commentId: number;
  notificationType: "COMMENT_REPLIED";
};

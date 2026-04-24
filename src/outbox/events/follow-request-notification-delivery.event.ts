/** Names the durable outbox event that delivers a persisted follow-request notification. */
export const FOLLOW_REQUEST_NOTIFICATION_DELIVERY_EVENT =
  "notification.followRequest.deliver";

/** Carries the stable identifiers needed to deliver a persisted follow-request notification. */
export type FollowRequestNotificationDeliveryPayload = {
  notificationId: number;
  recipientId: number;
  actorId: number;
  followRequestId: number;
  notificationType: "FOLLOW_REQUESTED";
};

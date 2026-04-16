import { Injectable } from "@nestjs/common";

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";

import type { SafeNotificationDTO } from "@/notifications/dto/safe-notification.dto";

export function buildNotificationReceivedTrigger(recipientId: number): string {
  return `notificationReceived.${recipientId}`;
}

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly graphqlPubSub: GraphqlPubSubService) {}

  // Publishes one persisted notification to subscribed clients
  async publishNotificationReceived(
    notification: SafeNotificationDTO,
  ): Promise<void> {
    await this.graphqlPubSub.publish(
      buildNotificationReceivedTrigger(notification.recipientId),
      {
        notificationReceived: notification,
      },
    );
  }
}

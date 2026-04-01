import { Injectable } from "@nestjs/common";

import { GraphqlPubSubService } from "@/graphql/subscriptions/graphql-pubsub.service";

import type { SafeNotificationDTO } from "@/notifications/dto/safe-notification.dto";

@Injectable()
export class NotificationDeliveryService {
  constructor(private readonly graphqlPubSub: GraphqlPubSubService) {}

  // Publishes one persisted notification to subscribed clients
  async publishNotificationReceived(
    notification: SafeNotificationDTO,
  ): Promise<void> {
    await this.graphqlPubSub.publish("notificationReceived", {
      notificationReceived: notification,
    });
  }
}

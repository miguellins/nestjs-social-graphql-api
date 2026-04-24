import { Module } from "@nestjs/common";

import { NotificationDeliveryService } from "@/notifications/notification-delivery.service";
import { NotificationTriggerService } from "@/notifications/notification-trigger.service";
import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";
import { NotificationsResolver } from "@/notifications/notifications.resolver";
import { NotificationsService } from "@/notifications/notifications.service";

@Module({
  providers: [
    NotificationDeliveryService,
    NotificationOutboxHandler,
    NotificationTriggerService,
    NotificationsService,
    NotificationsResolver,
  ],
  exports: [
    NotificationDeliveryService,
    NotificationOutboxHandler,
    NotificationsService,
    NotificationTriggerService,
  ],
})
export class NotificationsModule {}

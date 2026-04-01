import { Module } from "@nestjs/common";

import { NotificationDeliveryService } from "@/notifications/notification-delivery.service";
import { NotificationTriggerService } from "@/notifications/notification-trigger.service";
import { NotificationsResolver } from "@/notifications/notifications.resolver";
import { NotificationsService } from "@/notifications/notifications.service";

@Module({
  providers: [
    NotificationDeliveryService,
    NotificationTriggerService,
    NotificationsService,
    NotificationsResolver,
  ],
  exports: [NotificationsService, NotificationTriggerService],
})
export class NotificationsModule {}

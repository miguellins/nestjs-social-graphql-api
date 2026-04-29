import { Module } from "@nestjs/common";

import { NotificationDeliveryService } from "@/notifications/notification-delivery.service";
import { NotificationTriggerService } from "@/notifications/notification-trigger.service";
import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";
import { NotificationsResolver } from "@/notifications/notifications.resolver";
import { NotificationsService } from "@/notifications/notifications.service";

import { MutesModule } from "@/mutes/mutes.module";

@Module({
  imports: [MutesModule],
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

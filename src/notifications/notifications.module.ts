import { Module } from "@nestjs/common";

import { NotificationPreferencesService } from "@/notifications/notification-preferences.service";
import { NotificationActorPreferencesService } from "@/notifications/notification-actor-preferences.service";
import { NotificationDeliveryService } from "@/notifications/notification-delivery.service";
import { NotificationTriggerService } from "@/notifications/notification-trigger.service";
import { NotificationOutboxHandler } from "@/notifications/notification-outbox.handler";
import { NotificationsResolver } from "@/notifications/notifications.resolver";
import { NotificationsService } from "@/notifications/notifications.service";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { MetricsModule } from "@/metrics/metrics.module";

import { MutesModule } from "@/mutes/mutes.module";

@Module({
  imports: [CacheHelpersModule, MutesModule, MetricsModule],
  providers: [
    NotificationDeliveryService,
    NotificationActorPreferencesService,
    NotificationOutboxHandler,
    NotificationPreferencesService,
    NotificationTriggerService,
    NotificationsService,
    NotificationsResolver,
  ],
  exports: [
    NotificationDeliveryService,
    NotificationActorPreferencesService,
    NotificationOutboxHandler,
    NotificationPreferencesService,
    NotificationsService,
    NotificationTriggerService,
  ],
})
export class NotificationsModule {}

import { forwardRef, Global, Module } from "@nestjs/common";

import { NotificationOutboxEventHandler } from "@/notifications/notification-outbox.event-handler";
import { OutboxHandlerRegistryService } from "@/outbox/outbox-handler-registry.service";
import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OUTBOX_EVENT_HANDLERS } from "@/outbox/outbox-handler.types";
import { OutboxWorkerService } from "@/outbox/outbox-worker.service";
import { OutboxService } from "@/outbox/outbox.service";

import { NotificationsModule } from "@/notifications/notifications.module";

import { HomeFeedOutboxEventHandler } from "@/posts/home-feed-outbox.event-handler";

import { MetricsModule } from "@/metrics/metrics.module";

import { PostsModule } from "@/posts/posts.module";

/** Shared durable outbox infrastructure for background delivery and follow-up work. */
@Global()
@Module({
  imports: [MetricsModule, NotificationsModule, forwardRef(() => PostsModule)],
  providers: [
    OutboxService,
    NotificationOutboxEventHandler,
    HomeFeedOutboxEventHandler,
    {
      provide: OUTBOX_EVENT_HANDLERS,
      useFactory: (
        notificationHandler: NotificationOutboxEventHandler,
        homeFeedHandler: HomeFeedOutboxEventHandler,
      ) => [notificationHandler, homeFeedHandler],
      inject: [NotificationOutboxEventHandler, HomeFeedOutboxEventHandler],
    },
    OutboxHandlerRegistryService,
    OutboxProcessorService,
    OutboxWorkerService,
  ],
  exports: [
    OutboxService,
    OutboxHandlerRegistryService,
    OutboxProcessorService,
    OutboxWorkerService,
  ],
})
export class OutboxModule {}

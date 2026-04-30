import { forwardRef, Global, Module } from "@nestjs/common";

import { OutboxProcessorService } from "@/outbox/outbox-processor.service";
import { OutboxWorkerService } from "@/outbox/outbox-worker.service";
import { OutboxService } from "@/outbox/outbox.service";

import { NotificationsModule } from "@/notifications/notifications.module";

import { MetricsModule } from "@/metrics/metrics.module";

import { PostsModule } from "@/posts/posts.module";

/** Shared durable outbox infrastructure for background delivery and follow-up work. */
@Global()
@Module({
  imports: [MetricsModule, NotificationsModule, forwardRef(() => PostsModule)],
  providers: [OutboxService, OutboxProcessorService, OutboxWorkerService],
  exports: [OutboxService, OutboxProcessorService, OutboxWorkerService],
})
export class OutboxModule {}

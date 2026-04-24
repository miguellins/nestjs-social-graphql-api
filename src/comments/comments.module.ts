import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { CommentsReadService } from "@/comments/comments-read.service";
import { CommentsResolver } from "@/comments/comments.resolver";
import { CommentsService } from "@/comments/comments.service";

import { NotificationsModule } from "@/notifications/notifications.module";

import { MentionsModule } from "@/mentions/mentions.module";

import { OutboxModule } from "@/outbox/outbox.module";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    CacheHelpersModule,
    NotificationsModule,
    OutboxModule,
    MentionsModule,
  ],
  providers: [CommentsReadService, CommentsService, CommentsResolver],
  exports: [CommentsReadService, CommentsService],
})
export class CommentsModule {}

import { forwardRef, Module } from "@nestjs/common";

import { CommentsReadService } from "@/comments/comments-read.service";
import { CommentsResolver } from "@/comments/comments.resolver";
import { CommentsService } from "@/comments/comments.service";

import { NotificationsModule } from "@/notifications/notifications.module";
import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { MentionsModule } from "@/mentions/mentions.module";
import { OutboxModule } from "@/outbox/outbox.module";
import { PrismaModule } from "@/prisma/prisma.module";
import { MutesModule } from "@/mutes/mutes.module";

@Module({
  imports: [
    PrismaModule,
    CacheHelpersModule,
    NotificationsModule,
    MutesModule,
    forwardRef(() => OutboxModule),
    MentionsModule,
  ],
  providers: [CommentsReadService, CommentsService, CommentsResolver],
  exports: [CommentsReadService, CommentsService],
})
export class CommentsModule {}

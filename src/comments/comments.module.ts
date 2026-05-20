import { forwardRef, Module } from "@nestjs/common";

import { CommentCacheService } from "@/comments/comment-cache.service";
import { CommentCreateService } from "@/comments/comment-create.service";
import { CommentGuardsService } from "@/comments/comment-guards.service";
import { CommentModerationService } from "@/comments/comment-moderation.service";
import { CommentWriteService } from "@/comments/comment-write.service";
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
  providers: [
    CommentCacheService,
    CommentCreateService,
    CommentGuardsService,
    CommentModerationService,
    CommentWriteService,
    CommentsReadService,
    CommentsService,
    CommentsResolver,
  ],
  exports: [CommentsReadService, CommentsService],
})
export class CommentsModule {}

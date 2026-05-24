import { forwardRef, Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { MentionsModule } from "@/mentions/mentions.module";
import { CommentsModule } from "@/comments/comments.module";
import { HashtagsModule } from "@/hashtags/hashtags.module";
import { MetricsModule } from "@/metrics/metrics.module";
import { MediaModule } from "@/media/media.module";
import { MutesModule } from "@/mutes/mutes.module";

import { HomeFeedProjectionService } from "@/posts/home-feed-projection.service";
import { HomeFeedOutboxHandler } from "@/posts/home-feed-outbox.handler";
import { FeedReadService } from "@/posts/feed-read.service";
import { PostCacheService } from "@/posts/post-cache.service";
import { PostListReadService } from "@/posts/post-list-read.service";
import { PostModerationService } from "@/posts/post-moderation.service";
import { PostReadService } from "@/posts/post-read.service";
import { PostWriteService } from "@/posts/post-write.service";
import { PostsResolver } from "@/posts/posts.resolver";
import { PostsService } from "@/posts/posts.service";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    CacheHelpersModule,
    MediaModule,
    MutesModule,
    MetricsModule,
    forwardRef(() => CommentsModule),
    MentionsModule,
    forwardRef(() => HashtagsModule),
  ],
  providers: [
    FeedReadService,
    PostCacheService,
    PostListReadService,
    PostModerationService,
    PostReadService,
    PostWriteService,
    HomeFeedProjectionService,
    HomeFeedOutboxHandler,
    PostsService,
    PostsResolver,
  ],
  exports: [
    PostsService,
    PostReadService,
    PostCacheService,
    HomeFeedProjectionService,
    HomeFeedOutboxHandler,
  ],
})
export class PostsModule {}

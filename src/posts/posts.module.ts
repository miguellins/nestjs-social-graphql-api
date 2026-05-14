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
import { PostReadService } from "@/posts/post-read.service";
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
    PostReadService,
    HomeFeedProjectionService,
    HomeFeedOutboxHandler,
    PostsService,
    PostsResolver,
  ],
  exports: [
    PostsService,
    PostReadService,
    HomeFeedProjectionService,
    HomeFeedOutboxHandler,
  ],
})
export class PostsModule {}

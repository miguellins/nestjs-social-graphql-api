import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { HashtagsModule } from "@/hashtags/hashtags.module";
import { MentionsModule } from "@/mentions/mentions.module";
import { MutesModule } from "@/mutes/mutes.module";
import { NotificationsModule } from "@/notifications/notifications.module";
import { PostsModule } from "@/posts/posts.module";
import { PrismaModule } from "@/prisma/prisma.module";

import { RepostReadService } from "@/reposts/repost-read.service";
import { RepostWriteService } from "@/reposts/repost-write.service";
import { RepostsResolver } from "@/reposts/reposts.resolver";
import { RepostsService } from "@/reposts/reposts.service";

@Module({
  imports: [
    PrismaModule,
    CacheHelpersModule,
    PostsModule,
    MentionsModule,
    HashtagsModule,
    MutesModule,
    NotificationsModule,
  ],
  providers: [
    RepostReadService,
    RepostWriteService,
    RepostsService,
    RepostsResolver,
  ],
  exports: [RepostsService],
})
export class RepostsModule {}

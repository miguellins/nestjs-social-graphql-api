import { forwardRef, Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { PostsModule } from "@/posts/posts.module";
import { MutesModule } from "@/mutes/mutes.module";

import { HashtagsResolver } from "@/hashtags/hashtags.resolver";
import { HashtagsService } from "@/hashtags/hashtags.service";

@Module({
  imports: [CacheHelpersModule, MutesModule, forwardRef(() => PostsModule)],
  providers: [HashtagsService, HashtagsResolver],
  exports: [HashtagsService],
})
export class HashtagsModule {}

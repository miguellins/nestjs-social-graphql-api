import { Module } from "@nestjs/common";

import { BookmarksResolver } from "@/bookmarks/bookmarks.resolver";
import { BookmarksService } from "@/bookmarks/bookmarks.service";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { PostsModule } from "@/posts/posts.module";
import { MutesModule } from "@/mutes/mutes.module";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule, PostsModule, MutesModule],
  providers: [BookmarksService, BookmarksResolver],
})
export class BookmarksModule {}

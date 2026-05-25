import { Module } from "@nestjs/common";

import { SearchPostsReadService } from "@/search/search-posts-read.service";
import { SearchUsersReadService } from "@/search/search-users-read.service";
import { SearchResolver } from "@/search/search.resolver";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { MutesModule } from "@/mutes/mutes.module";

import { PostsModule } from "@/posts/posts.module";

import { PrismaModule } from "@/prisma/prisma.module";

import { UsersModule } from "@/users/users.module";

@Module({
  imports: [
    PrismaModule,
    CacheHelpersModule,
    PostsModule,
    UsersModule,
    MutesModule,
  ],
  providers: [SearchPostsReadService, SearchUsersReadService, SearchResolver],
})
export class SearchModule {}

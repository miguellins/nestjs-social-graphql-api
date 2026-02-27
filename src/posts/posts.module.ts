import { Module } from "@nestjs/common";

import { CacheModule } from "@/common/cache/cache.module";
import { PrismaModule } from "@/prisma.module";

import { PostsResolver } from "@/posts/posts.resolver";
import { PostsService } from "@/posts/posts.service";

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [PostsService, PostsResolver],
  exports: [PostsService],
})
export class PostsModule {}

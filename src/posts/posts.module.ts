import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { MediaModule } from "@/media/media.module";

import { PostReadService } from "@/posts/post-read.service";
import { PostsResolver } from "@/posts/posts.resolver";
import { PostsService } from "@/posts/posts.service";

import { CommentsModule } from "@/comments/comments.module";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule, MediaModule, CommentsModule],
  providers: [PostReadService, PostsService, PostsResolver],
  exports: [PostsService, PostReadService],
})
export class PostsModule {}

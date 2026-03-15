import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { PostsResolver } from "@/posts/posts.resolver";
import { PostsService } from "@/posts/posts.service";

import { PrismaModule } from "@/prisma.module";

/**
 * Registers the posts module providers and dependencies
 */

@Module({
  imports: [PrismaModule, CacheHelpersModule],
  providers: [PostsService, PostsResolver],
  exports: [PostsService],
})
export class PostsModule {}

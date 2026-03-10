import { Module } from "@nestjs/common";

import { PrismaModule } from "@/prisma.module";
import { CacheModule } from "@/common/cache/cache.module";

import { CommentsResolver } from "@/comments/comments.resolver";
import { CommentsService } from "@/comments/comments.service";

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [CommentsService, CommentsResolver],
  exports: [CommentsService],
})
export class CommentsModule {}

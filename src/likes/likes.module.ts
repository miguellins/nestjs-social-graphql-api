import { Module } from "@nestjs/common";

import { CacheModule } from "@/common/cache/cache.module";
import { PrismaModule } from "@/prisma.module";

import { LikeResolver } from "@/likes/likes.resolver";
import { LikesService } from "@/likes/likes.service";

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [LikesService, LikeResolver],
  exports: [LikesService],
})
export class LikesModule {}

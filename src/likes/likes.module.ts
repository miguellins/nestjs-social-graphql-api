import { Module } from "@nestjs/common";

import { NotificationsModule } from "@/notifications/notifications.module";
import { CacheModule } from "@/common/cache/cache.module";
import { PrismaModule } from "@/prisma.module";

import { LikeResolver } from "@/likes/likes.resolver";
import { LikesService } from "@/likes/likes.service";

@Module({
  imports: [PrismaModule, CacheModule, NotificationsModule],
  providers: [LikesService, LikeResolver],
  exports: [LikesService],
})
export class LikesModule {}

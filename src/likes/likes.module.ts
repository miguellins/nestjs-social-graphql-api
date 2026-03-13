import { Module } from "@nestjs/common";

import { NotificationsModule } from "@/notifications/notifications.module";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { LikeResolver } from "@/likes/likes.resolver";
import { LikesService } from "@/likes/likes.service";

import { PrismaModule } from "@/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule, NotificationsModule],
  providers: [LikesService, LikeResolver],
  exports: [LikesService],
})
export class LikesModule { }

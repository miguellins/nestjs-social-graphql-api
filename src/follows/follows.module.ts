import { Module } from "@nestjs/common";

import { NotificationsModule } from "@/notifications/notifications.module";
import { CacheModule } from "@/common/cache/cache.module";
import { PrismaModule } from "@/prisma.module";

import { FollowsResolver } from "@/follows/follows.resolver";
import { FollowsService } from "@/follows/follows.service";

@Module({
  imports: [PrismaModule, CacheModule, NotificationsModule],
  providers: [FollowsService, FollowsResolver],
  exports: [FollowsService],
})
export class FollowsModule {}

import { Module } from "@nestjs/common";

import { NotificationsModule } from "@/notifications/notifications.module";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { FollowsResolver } from "@/follows/follows.resolver";
import { FollowsService } from "@/follows/follows.service";

import { PrismaModule } from "@/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule, NotificationsModule],
  providers: [FollowsService, FollowsResolver],
  exports: [FollowsService],
})
export class FollowsModule { }

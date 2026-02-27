import { Module } from "@nestjs/common";

import { CacheModule } from "@/common/cache/cache.module";
import { PrismaModule } from "@/prisma.module";

import { FollowsResolver } from "@/follows/follows.resolver";
import { FollowsService } from "@/follows/follows.service";

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [FollowsService, FollowsResolver],
  exports: [FollowsService],
})
export class FollowsModule {}

import { Module } from "@nestjs/common";

import { PrismaModule } from "@/prisma.module";

import { FollowsResolver } from "@/follows/follows.resolver";
import { FollowsService } from "@/follows/follows.service";

@Module({
  imports: [PrismaModule],
  providers: [FollowsService, FollowsResolver],
  exports: [FollowsService],
})
export class FollowsModule {}

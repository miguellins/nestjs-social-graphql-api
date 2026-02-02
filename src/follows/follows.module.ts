import { Module } from "@nestjs/common";

import { PrismaModule } from "src/prisma.module";

import { FollowsResolver } from "./follows.resolver";
import { FollowsService } from "./follows.service";

@Module({
  imports: [PrismaModule],
  providers: [FollowsService, FollowsResolver, PrismaModule],
  exports: [FollowsService],
})
export class FollowsModule {}

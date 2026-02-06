import { Module } from "@nestjs/common";

import { PrismaModule } from "src/prisma.module";

import { LikeResolver } from "./likes.resolver";
import { LikesService } from "./likes.service";

@Module({
  imports: [PrismaModule],
  providers: [LikesService, LikeResolver, PrismaModule],
  exports: [LikesService],
})
export class LikesModule {}

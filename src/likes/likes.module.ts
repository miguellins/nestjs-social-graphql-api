import { Module } from "@nestjs/common";

import { PrismaModule } from "src/prisma.module";

import { LikesService } from "./likes.service";
import { LikeResolver } from "./likes.resolver";

@Module({
  imports: [PrismaModule],
  providers: [LikesService, LikeResolver, PrismaModule],
  exports: [LikesService],
})
export class LikesModule {}

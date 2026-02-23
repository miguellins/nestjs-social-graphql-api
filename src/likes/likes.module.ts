import { Module } from "@nestjs/common";

import { PrismaModule } from "@/prisma.module";

import { LikeResolver } from "@/likes/likes.resolver";
import { LikesService } from "@/likes/likes.service";

@Module({
  imports: [PrismaModule],
  providers: [LikesService, LikeResolver],
  exports: [LikesService],
})
export class LikesModule { }

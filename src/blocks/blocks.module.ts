import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";

import { BlocksResolver } from "@/blocks/blocks.resolver";
import { BlocksService } from "@/blocks/blocks.service";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule],
  providers: [BlocksService, BlocksResolver],
  exports: [BlocksService],
})
export class BlocksModule {}

import { Module } from "@nestjs/common";

import { MutesResolver } from "@/mutes/mutes.resolver";
import { MutesService } from "@/mutes/mutes.service";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule],
  providers: [MutesService, MutesResolver],
  exports: [MutesService],
})
export class MutesModule {}

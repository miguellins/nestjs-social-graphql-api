import { Module } from "@nestjs/common";

import { CacheModule } from "@/common/cache/cache.module";
import { PrismaModule } from "@/prisma.module";

import { UsersResolver } from "@/users/users.resolver";
import { UsersService } from "@/users/users.service";

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [UsersService, UsersResolver],
  exports: [UsersService],
})
export class UsersModule {}

import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { PasswordModule } from "@/common/security/password.module";

import { UserCacheService } from "@/users/user-cache.service";
import { UsersResolver } from "@/users/users.resolver";
import { UsersService } from "@/users/users.service";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule, PasswordModule],
  providers: [UserCacheService, UsersService, UsersResolver],
  exports: [UsersService],
})
export class UsersModule {}

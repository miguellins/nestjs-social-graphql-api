import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { PasswordModule } from "@/common/security/password.module";

import { UserProfileReadService } from "@/users/user-profile-read.service";
import { UserCacheService } from "@/users/user-cache.service";
import { UsersResolver } from "@/users/users.resolver";
import { UsersService } from "@/users/users.service";

import { MediaModule } from "@/media/media.module";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, CacheHelpersModule, PasswordModule, MediaModule],
  providers: [
    UserCacheService,
    UserProfileReadService,
    UsersService,
    UsersResolver,
  ],
  exports: [UsersService],
})
export class UsersModule {}

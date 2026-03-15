import { Module } from "@nestjs/common";

import { CacheHelpersModule } from "@/common/cache/cache-helpers.module";
import { PasswordModule } from "@/common/security/password.module";

import { UsersResolver } from "@/users/users.resolver";
import { UsersService } from "@/users/users.service";

import { PrismaModule } from "@/prisma.module";

/**
 * Registers the users module providers and dependencies
 */

@Module({
  imports: [PrismaModule, CacheHelpersModule, PasswordModule],
  providers: [UsersService, UsersResolver],
  exports: [UsersService],
})
export class UsersModule {}

import { Module } from "@nestjs/common";

import { PrismaModule } from "src/prisma.module";

import { UsersResolver } from "./users.resolver";
import { UsersService } from "./users.service";

@Module({
  imports: [PrismaModule],
  providers: [UsersService, UsersResolver],
  exports: [UsersService],
})
export class UsersModule {}

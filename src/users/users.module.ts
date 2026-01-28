import { Module } from "@nestjs/common";

import { UsersResolver } from "./users.resolver";
import { UsersService } from "./users.service";
import { PrismaModule } from "src/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [UsersService, UsersResolver, PrismaModule],
})
export class UsersModule { }

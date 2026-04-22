import { Module } from "@nestjs/common";

import { NotificationsModule } from "@/notifications/notifications.module";

import { MentionsService } from "@/mentions/mentions.service";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [MentionsService],
  exports: [MentionsService],
})
export class MentionsModule {}

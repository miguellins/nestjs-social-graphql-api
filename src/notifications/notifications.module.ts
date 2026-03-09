import { Module } from "@nestjs/common";

import { NotificationsResolver } from "@/notifications/notifications.resolver";
import { NotificationsService } from "@/notifications/notifications.service";

import { PrismaService } from "@/prisma.service";

@Module({
  providers: [PrismaService, NotificationsService, NotificationsResolver],
  exports: [NotificationsService],
})
export class NotificationsModule {}

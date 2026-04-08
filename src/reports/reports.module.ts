import { Module } from "@nestjs/common";

import { ReportsResolver } from "@/reports/reports.resolver";
import { ReportsService } from "@/reports/reports.service";

import { PrismaModule } from "@/prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [ReportsService, ReportsResolver],
  exports: [ReportsService],
})
export class ReportsModule {}

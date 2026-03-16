import { Injectable, OnModuleInit } from "@nestjs/common";

import { PrismaClient } from "@prisma/client";

/**
 * Prisma service for database access
 *
 * Manages the Prisma client lifecycle for NestJS
 */

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

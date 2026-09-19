import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@agent-study/database/prisma';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

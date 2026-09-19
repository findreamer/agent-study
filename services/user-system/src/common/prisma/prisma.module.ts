import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@agent-study/database';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

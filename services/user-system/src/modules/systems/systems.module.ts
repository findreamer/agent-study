import { Module } from '@nestjs/common';
import { SystemsController } from './systems.controller.js';
import { SystemsService } from './systems.service.js';

@Module({
  controllers: [SystemsController],
  providers: [SystemsService],
})
export class SystemsModule {}

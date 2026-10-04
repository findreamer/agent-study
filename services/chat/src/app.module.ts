import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LlmModule } from './llm/llm.module.js';
import { AdvancedModule } from './llm/advanced.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ConversationModule } from './conversation/conversation.module.js';

@Module({
  imports: [PrismaModule, LlmModule, AdvancedModule, ConversationModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

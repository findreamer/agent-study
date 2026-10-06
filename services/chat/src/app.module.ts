import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LlmModule } from './llm/llm.module.js';
import { AdvancedModule } from './llm/advanced.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ConversationModule } from './conversation/conversation.module.js';
import { DocumentModule } from './document/document.module.js';
import { SseModule } from './sse/sse.module.js';

@Module({
  imports: [
    PrismaModule,
    ScheduleModule.forRoot(),
    LlmModule,
    AdvancedModule,
    ConversationModule,
    DocumentModule,
    SseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

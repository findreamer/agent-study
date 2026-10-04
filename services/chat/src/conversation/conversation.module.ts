import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConversationService } from './conversation.service.js';
import { ConversationChatService } from './conversation-chat.service.js';
import { ConversationController } from './conversation.controller.js';
import { MessageService } from '../message/message.service.js';

@Module({
  imports: [AuthModule],
  controllers: [ConversationController],
  providers: [ConversationService, MessageService, ConversationChatService],
  exports: [ConversationService, MessageService, ConversationChatService],
})
export class ConversationModule {}

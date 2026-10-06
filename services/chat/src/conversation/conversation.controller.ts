import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { ConversationService } from './conversation.service.js';
import { MessageService } from '../message/message.service.js';
import { AdvancedAnalysisService } from '../llm/advanced-analysis.service.js';

const MAX_TITLE_LENGTH = 100;
const MAX_HISTORY_LIMIT = 200;

@UseGuards(JwtAuthGuard)
@Controller('api/conversations')
export class ConversationController {
  constructor(
    private readonly conversations: ConversationService,
    private readonly messageService: MessageService,
    private readonly analysis: AdvancedAnalysisService,
  ) {}

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body() body: { title?: string },
  ) {
    const title = body?.title;
    if (title !== undefined && (typeof title !== 'string' || !title.trim())) {
      throw new BadRequestException('title 必须是非空字符串');
    }
    if (typeof title === 'string' && title.length > MAX_TITLE_LENGTH) {
      throw new BadRequestException(`title 不能超过 ${MAX_TITLE_LENGTH} 字`);
    }
    const conversation = await this.conversations.create(user.userId, title);
    return { conversation };
  }

  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return { conversations: await this.conversations.findByUser(user.userId) };
  }

  @Get(':id/messages')
  async messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    await this.conversations.findById(id, user.userId);
    let parsedLimit = 50;
    if (limit !== undefined) {
      parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_HISTORY_LIMIT) {
        throw new BadRequestException(`limit 必须是 1~${MAX_HISTORY_LIMIT} 的整数`);
      }
    }
    return {
      messages: await this.messageService.getHistory(id, parsedLimit),
    };
  }

  @Post(':id/chat')
  async chat(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { input?: string },
  ) {
    const input = body?.input;
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    await this.conversations.findById(id, user.userId);
    // 统一分析入口：会话历史 + pgvector 检索上下文 → 多 Agent 分析，结论落 messages 表
    return this.analysis.analyze(user.userId, id, input);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.conversations.delete(id, user.userId);
    return { ok: true };
  }
}

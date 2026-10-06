import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import type { AdvancedAnalysisResult } from './advanced-analysis.service.js';
import { AdvancedAnalysisService } from './advanced-analysis.service.js';

@Controller('api/advanced')
export class AdvancedController {
  constructor(private readonly analysis: AdvancedAnalysisService) {}

  /**
   * 第四章演示路由，现在走与 /api/conversations/:id/chat 相同的统一分析入口：
   * 会话历史（messages 表）+ 语义检索（pgvector）→ 多 Agent 编排 → 结论落库。
   */
  @UseGuards(JwtAuthGuard)
  @Post('analyze')
  async analyze(
    @CurrentUser() user: AuthUser,
    @Body() body: { conversationId?: string; input?: string },
  ): Promise<AdvancedAnalysisResult> {
    const conversationId = body?.conversationId;
    const input = body?.input;
    if (typeof conversationId !== 'string' || !conversationId.trim()) {
      throw new BadRequestException('conversationId 必须是非空字符串');
    }
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return this.analysis.analyze(user.userId, conversationId, input);
  }
}

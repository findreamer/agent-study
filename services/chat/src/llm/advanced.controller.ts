import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { AdvancedAnalysisResult } from './advanced-analysis.service.js';
import { AdvancedAnalysisService } from './advanced-analysis.service.js';

@Controller('api/advanced')
export class AdvancedController {
  constructor(private readonly analysis: AdvancedAnalysisService) {}

  /**
   * 统一入口：多轮记忆（memory）→ 多 Agent 编排（agents）→ 报告落盘（files）。
   * 前几轮用 POST /api/memory/chat 积累会话上下文，本轮触发完整分析。
   */
  @Post('analyze')
  async analyze(
    @Body() body: { sessionId?: string; input?: string },
  ): Promise<AdvancedAnalysisResult> {
    const sessionId = body?.sessionId;
    const input = body?.input;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new BadRequestException('sessionId 必须是非空字符串');
    }
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return this.analysis.analyze(sessionId, input);
  }
}

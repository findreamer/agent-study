import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import type { OrchestrationResult } from './orchestrator.service.js';
import { AgentOrchestratorService } from './orchestrator.service.js';

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly orchestrator: AgentOrchestratorService) {}

  @Post('orchestrate')
  async orchestrate(@Body() body: { input?: string }): Promise<OrchestrationResult> {
    const input = body?.input;
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return this.orchestrator.orchestrate(input);
  }
}

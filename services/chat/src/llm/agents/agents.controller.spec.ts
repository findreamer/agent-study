import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AgentsController } from './agents.controller.js';
import type { AgentOrchestratorService } from './orchestrator.service.js';

describe('AgentsController', () => {
  it('input 缺失时返回 400', async () => {
    const controller = new AgentsController({} as AgentOrchestratorService);
    await expect(controller.orchestrate({})).rejects.toThrow(BadRequestException);
    await expect(controller.orchestrate({ input: '   ' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('input 合法时委托编排器执行', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ status: 'completed' });
    const controller = new AgentsController({ orchestrate } as unknown as AgentOrchestratorService);
    const result = await controller.orchestrate({ input: '做一个需求分析系统' });
    expect(orchestrate).toHaveBeenCalledWith('做一个需求分析系统');
    expect(result).toEqual({ status: 'completed' });
  });
});

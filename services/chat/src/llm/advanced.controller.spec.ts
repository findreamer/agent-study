import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AdvancedController } from './advanced.controller.js';
import type { AdvancedAnalysisService } from './advanced-analysis.service.js';

const user = { userId: 'u1', username: 'u1' } as never;

describe('AdvancedController', () => {
  it('conversationId / input 缺失时返回 400', async () => {
    const fakeService = { analyze: vi.fn() } as unknown as AdvancedAnalysisService;
    const controller = new AdvancedController(fakeService);
    await expect(controller.analyze(user, {})).rejects.toThrow(BadRequestException);
    await expect(controller.analyze(user, { conversationId: 'c1' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      controller.analyze(user, { conversationId: 'c1', input: '  ' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('参数合法时以 (userId, conversationId, input) 委托统一分析服务', async () => {
    const analyze = vi.fn().mockResolvedValue({ status: 'completed' });
    const controller = new AdvancedController({ analyze } as unknown as AdvancedAnalysisService);
    const result = await controller.analyze(user, { conversationId: 'c1', input: '帮我产出报告' });
    expect(analyze).toHaveBeenCalledWith('u1', 'c1', '帮我产出报告');
    expect(result).toEqual({ status: 'completed' });
  });
});

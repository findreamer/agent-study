import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AdvancedController } from './advanced.controller.js';
import type { AdvancedAnalysisService } from './advanced-analysis.service.js';

describe('AdvancedController', () => {
  const fakeService = { analyze: vi.fn().mockResolvedValue({ status: 'completed' }) } as unknown as AdvancedAnalysisService;

  it('sessionId / input 缺失时返回 400', async () => {
    const controller = new AdvancedController(fakeService);
    await expect(controller.analyze({})).rejects.toThrow(BadRequestException);
    await expect(controller.analyze({ sessionId: 's1' })).rejects.toThrow(BadRequestException);
    await expect(controller.analyze({ sessionId: 's1', input: '  ' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('参数合法时委托统一分析服务', async () => {
    const analyze = vi.fn().mockResolvedValue({ status: 'completed' });
    const controller = new AdvancedController({ analyze } as unknown as AdvancedAnalysisService);
    const result = await controller.analyze({ sessionId: 's1', input: '帮我产出报告' });
    expect(analyze).toHaveBeenCalledWith('s1', '帮我产出报告');
    expect(result).toEqual({ status: 'completed' });
  });
});

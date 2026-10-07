import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { AgentOrchestratorService } from '../agents/orchestrator.service.js';
import type { OrchestrationResult } from '../agents/orchestrator.service.js';
import { UiAnalysisStreamService } from './ui-analysis-stream.service.js';
import type { UiFlowService } from './ui-flow.service.js';

const COMPLETED: OrchestrationResult = {
  mode: 'fixed_workflow',
  status: 'completed',
  clarificationQuestions: [],
  usedAgents: ['extract', 'clarify', 'analysis', 'risk', 'summary'],
  fallback: null,
  steps: [],
  report: '# 需求分析报告',
};

function makeOrchestrator(
  events: Array<Record<string, unknown>>,
  result: OrchestrationResult,
): AgentOrchestratorService {
  // 模拟 streamOrchestration：先吐事件，再返回最终结果
  const queue = [...events, { __result: result }];
  return {
    streamOrchestration: () => ({
      next: async () => {
        const item = queue.shift();
        if (item && '__result' in item) return { done: true, value: item.__result };
        return { done: false, value: item };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    }),
  } as unknown as AgentOrchestratorService;
}

function makeFlow(collectedData: Record<string, unknown> | null) {
  return {
    getSession: vi.fn().mockReturnValue(
      collectedData === null ? null : { stage: 'result', collectedData },
    ),
    buildAnalysisInput: vi.fn().mockReturnValue('【需求名称】Excel 批量导入'),
    recordAssistantResponse: vi.fn(),
  } as unknown as UiFlowService & { recordAssistantResponse: ReturnType<typeof vi.fn> };
}

describe('UiAnalysisStreamService', () => {
  const FORM_DATA = {
    requirementType: '功能需求',
    requirementForm: {
      name: 'Excel 批量导入',
      priority: 'P0',
      description: '批量导入 Excel',
      acceptanceCriteria: '1 万行以内',
    },
  };

  it('completed：转发 stage/delta，结束后整包下发 steps+card+action_buttons', async () => {
    const orchestrator = makeOrchestrator(
      [
        { type: 'stage', agent: 'extract', index: 0, total: 5, label: '需求提取', percent: 0 },
        { type: 'delta', text: '# 报告' },
        { type: 'delta', text: '正文' },
      ],
      COMPLETED,
    );
    const flow = makeFlow(FORM_DATA);
    const service = new UiAnalysisStreamService(flow, orchestrator);

    const events = [];
    for await (const event of service.streamAnalysis('s1')) events.push(event);

    expect(events[0]).toMatchObject({ type: 'stage', stage: { label: '需求提取', percent: 0 } });
    expect(events[1]).toEqual({ type: 'delta', text: '# 报告' });
    const componentsEvent = events.find((e) => e.type === 'components');
    const componentTypes = componentsEvent!.components.map((c) => c.type);
    expect(componentTypes).toEqual(['steps', 'card', 'action_buttons']);
    expect(events.at(-1)).toEqual({ type: 'done', status: 'completed' });
    // 持久化时机：流结束后一次性写入，且 message + components 完整
    expect(flow.recordAssistantResponse).toHaveBeenCalledTimes(1);
    expect(flow.recordAssistantResponse).toHaveBeenCalledWith('s1', {
      message: '需求分析完成，报告如下：',
      components: componentsEvent!.components,
    });
  });

  it('分析输入由已收集数据组装，会话无表单时拒绝启动', async () => {
    const orchestrator = makeOrchestrator([], COMPLETED);
    const flow = makeFlow(FORM_DATA);
    const service = new UiAnalysisStreamService(flow, orchestrator);

    for await (const _ of service.streamAnalysis('s1')) void _;
    expect(flow.buildAnalysisInput).toHaveBeenCalledWith(FORM_DATA);

    const emptyFlow = makeFlow(null);
    const emptyService = new UiAnalysisStreamService(emptyFlow, orchestrator);
    await expect(emptyService.streamAnalysis('s2').next()).rejects.toThrow(BadRequestException);
  });

  it('needs_clarification：整包下发澄清问题文本', async () => {
    const orchestrator = makeOrchestrator([], {
      ...COMPLETED,
      status: 'needs_clarification',
      report: null,
      clarificationQuestions: ['数据量上限是多少？', '是否需要支持 CSV？'],
    });
    const service = new UiAnalysisStreamService(makeFlow(FORM_DATA), orchestrator);

    const events = [];
    for await (const event of service.streamAnalysis('s1')) events.push(event);

    const componentsEvent = events.find((e) => e.type === 'components');
    expect(componentsEvent!.components[0].type).toBe('text');
    expect(JSON.stringify(componentsEvent!.components)).toContain('数据量上限');
    expect(events.at(-1)).toEqual({ type: 'done', status: 'needs_clarification' });
  });

  it('failed：整包下发人工评审提示', async () => {
    const orchestrator = makeOrchestrator([], {
      ...COMPLETED,
      status: 'failed',
      fallback: 'manual_review',
      report: null,
    });
    const service = new UiAnalysisStreamService(makeFlow(FORM_DATA), orchestrator);

    const events = [];
    for await (const event of service.streamAnalysis('s1')) events.push(event);

    expect(events.at(-1)).toEqual({ type: 'done', status: 'failed' });
    expect(JSON.stringify(events.find((e) => e.type === 'components'))).toContain('人工评审');
  });
});

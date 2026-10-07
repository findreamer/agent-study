import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentOrchestratorService } from '../agents/orchestrator.service.js';
import { UiFlowService } from './ui-flow.service.js';
import type { AIUIResponse, UIResponse } from './ui-types.js';

/**
 * 分析流事件，与对话流（UiStreamEvent）共用同一套 SSE 帧协议：
 * stage 驱动五阶段进度条，delta 是 Markdown Agent 的逐段输出，
 * components 在流水线结束后整包下发，done 携带最终状态。
 */
export type AnalysisStreamEvent =
  | { type: 'stage'; stage: { index: number; total: number; label: string; percent: number } }
  | { type: 'delta'; text: string }
  | { type: 'components'; components: UIResponse[] }
  | { type: 'done'; status: string };

const RESULT_ACTIONS: UIResponse = {
  type: 'action_buttons',
  buttons: [
    { id: 'new_requirement', label: '再提一个需求', style: 'primary' },
    { id: 'view_requirements', label: '查看需求列表' },
  ],
  layout: 'horizontal',
};

const ANALYSIS_STEPS: UIResponse = {
  type: 'steps',
  steps: [
    { label: '需求提取' },
    { label: '澄清判断' },
    { label: '多维度分析' },
    { label: '风险评估' },
    { label: '综合报告' },
  ],
  currentStep: 5,
};

@Injectable()
export class UiAnalysisStreamService {
  constructor(
    private readonly flow: UiFlowService,
    private readonly orchestrator: AgentOrchestratorService,
  ) {}

  /**
   * 确认后的五 Agent 分析流水线：stage 进度 + Markdown 逐段输出，
   * 结束后一次性组装 UI 组件并整体写入会话历史（不落半截数据）。
   */
  async *streamAnalysis(sessionId: string): AsyncGenerator<AnalysisStreamEvent> {
    const session = this.flow.getSession(sessionId);
    if (!session || !session.collectedData.requirementForm) {
      throw new BadRequestException('会话尚未提交需求详情，无法启动分析');
    }
    const input = this.flow.buildAnalysisInput(session.collectedData);

    const generator = this.orchestrator.streamOrchestration(input);
    let report = '';
    let next = await generator.next();
    while (!next.done) {
      const event = next.value;
      if (event.type === 'stage') {
        yield {
          type: 'stage',
          stage: {
            index: event.index,
            total: event.total,
            label: event.label,
            percent: event.percent,
          },
        };
      } else if (event.type === 'delta') {
        report += event.text;
        yield { type: 'delta', text: event.text };
      }
      next = await generator.next();
    }
    const result = next.value;

    const components: UIResponse[] = [];
    if (result.status === 'completed') {
      components.push(
        ANALYSIS_STEPS,
        {
          type: 'card',
          title: `需求分析报告：${this.requirementName(session.collectedData)}`,
          fields: [
            { label: '状态', value: '分析完成' },
            { label: '涉及 Agent', value: result.usedAgents.join('、') },
            {
              label: '报告字数',
              value: `${result.report?.length ?? 0}`,
            },
          ],
          actions: [{ id: 'new_requirement', label: '再提一个需求' }],
        },
        RESULT_ACTIONS,
      );
    } else if (result.status === 'needs_clarification') {
      components.push({
        type: 'text',
        content: `需要澄清的问题：\n${result.clarificationQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`,
      });
    } else {
      components.push({
        type: 'text',
        content: '需求分析失败，已转人工评审，请稍后在任务通知中查看进展。',
      });
    }

    yield { type: 'components', components };
    yield { type: 'done', status: result.status };

    // 持久化时机：流结束后一次性写入会话历史
    const recorded: AIUIResponse = {
      message:
        result.status === 'completed'
          ? '需求分析完成，报告如下：'
          : result.status === 'needs_clarification'
            ? '需求分析需要先澄清以下问题：'
            : '需求分析失败：',
      components,
    };
    this.flow.recordAssistantResponse(sessionId, recorded);
  }

  private requirementName(collectedData: Record<string, unknown>): string {
    const form = (collectedData.requirementForm ?? {}) as Record<string, unknown>;
    return String(form['name'] ?? '未命名需求');
  }
}

import { describe, expect, it } from 'vitest';
import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { textOf } from '../messages/text.js';
import type { LlmService } from '../llm.service.js';
import { AgentOrchestratorService } from './orchestrator.service.js';

const AGENT_MARKERS = [
  '需求抽取 Agent',
  '澄清判断 Agent',
  '需求分析 Agent',
  '风险评估 Agent',
  '报告汇总 Agent',
] as const;

type AgentMarker = (typeof AGENT_MARKERS)[number];

const EXTRACT_JSON =
  '{"action":"开发会话记忆系统","targetUsers":"需求分析师","features":["多轮澄清","上下文裁剪"],"constraints":[],"entities":["会话记忆系统"]}';

class ScriptedChatModel extends SimpleChatModel {
  responses: Partial<Record<AgentMarker, string>>;
  failOn?: AgentMarker;

  constructor(responses: Partial<Record<AgentMarker, string>>, failOn?: AgentMarker) {
    super({});
    this.responses = responses;
    this.failOn = failOn;
  }

  _llmType(): string {
    return 'scripted-chat-model';
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    const text = messages.map((message) => textOf(message.content)).join('\n');
    const marker = AGENT_MARKERS.find((candidate) => text.includes(candidate));
    if (!marker) {
      throw new Error(`脚本化假模型无法识别提示词：${text.slice(0, 120)}`);
    }
    if (this.failOn === marker) {
      throw new Error(`${marker} 调用失败`);
    }
    const response = this.responses[marker];
    if (response === undefined) {
      throw new Error(`缺少 ${marker} 的脚本化响应`);
    }
    return response;
  }
}

function makeService(
  responses: Partial<Record<AgentMarker, string>>,
  failOn?: AgentMarker,
): AgentOrchestratorService {
  const llm = {
    chatModel: () => new ScriptedChatModel(responses, failOn),
  } as unknown as LlmService;
  return new AgentOrchestratorService(llm);
}

describe('AgentOrchestratorService', () => {
  it('信息完整时执行完整五 Agent 编排并产出报告', async () => {
    const service = makeService({
      '需求抽取 Agent': '```json\n' + EXTRACT_JSON + '\n```',
      '澄清判断 Agent': '{"needsClarification":false,"questions":[]}',
      '需求分析 Agent': '## 功能分解\n- 多轮澄清\n- 上下文裁剪',
      '风险评估 Agent': '## 技术风险\n- 长上下文成本，等级：中',
      '报告汇总 Agent': '# 需求分析报告\n结论：可行，建议先做 P0。',
    });

    const result = await service.orchestrate('开发一个会话记忆系统');

    expect(result.mode).toBe('fixed_workflow');
    expect(result.status).toBe('completed');
    expect(result.fallback).toBeNull();
    expect(result.clarificationQuestions).toEqual([]);
    expect(result.usedAgents).toEqual([
      'extract',
      'clarify',
      'analysis',
      'risk',
      'summary',
    ]);
    expect(result.report).toContain('需求分析报告');
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every((step) => step.ok)).toBe(true);
    expect(result.steps.map((step) => step.agent)).toEqual([
      'extract',
      'clarify',
      'analysis',
      'risk',
      'summary',
    ]);
  });

  it('需要澄清时返回澄清问题并终止流程', async () => {
    const questions = ['这个系统给谁用？', '核心使用场景是什么？'];
    const service = makeService({
      '需求抽取 Agent': EXTRACT_JSON,
      '澄清判断 Agent': `{"needsClarification":true,"questions":${JSON.stringify(questions)}}`,
    });

    const result = await service.orchestrate('做个系统');

    expect(result.status).toBe('needs_clarification');
    expect(result.clarificationQuestions).toEqual(questions);
    expect(result.usedAgents).toEqual(['extract', 'clarify']);
    expect(result.steps).toHaveLength(2);
    expect(result.report).toBeNull();
    expect(result.fallback).toBeNull();
  });

  it('上游 Agent 失败时返回 fallback manual_review', async () => {
    const service = makeService(
      {
        '需求抽取 Agent': EXTRACT_JSON,
        '澄清判断 Agent': '{"needsClarification":false,"questions":[]}',
        '需求分析 Agent': '## 功能分解\n- 多轮澄清',
        '风险评估 Agent': '## 技术风险\n- 无',
        '报告汇总 Agent': '# 需求分析报告',
      },
      '报告汇总 Agent',
    );

    const result = await service.orchestrate('开发一个会话记忆系统');

    expect(result.status).toBe('failed');
    expect(result.fallback).toBe('manual_review');
    expect(result.report).toBeNull();
    expect(result.usedAgents).toEqual(['extract', 'clarify', 'analysis', 'risk']);
    expect(result.steps.at(-1)).toMatchObject({ agent: 'summary', ok: false });
  });

  it('抽取输出非 JSON 时按失败兜底处理', async () => {
    const service = makeService({
      '需求抽取 Agent': '抱歉，我无法抽取。',
    });

    const result = await service.orchestrate('开发一个会话记忆系统');

    expect(result.status).toBe('failed');
    expect(result.fallback).toBe('manual_review');
    expect(result.usedAgents).toEqual([]);
    expect(result.steps.at(-1)).toMatchObject({ agent: 'extract', ok: false });
  });
});

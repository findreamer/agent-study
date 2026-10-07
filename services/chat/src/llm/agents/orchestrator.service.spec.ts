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
  /** 记录每次调用收到的完整提示词文本，供上下文传达断言使用 */
  texts: string[] = [];

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
    this.texts.push(text);
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

  it('流式编排：按五阶段发 stage 事件，Markdown Agent 逐段 delta，返回完整结果', async () => {
    const service = makeService({
      '需求抽取 Agent': '```json\n' + EXTRACT_JSON + '\n```',
      '澄清判断 Agent': '{"needsClarification":false,"questions":[]}',
      '需求分析 Agent': '## 功能分解\n- 多轮澄清',
      '风险评估 Agent': '## 技术风险\n- 长上下文成本',
      '报告汇总 Agent': '# 需求分析报告\n结论：可行',
    });

    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const generator = service.streamOrchestration('开发一个会话记忆系统');
    let next = await generator.next();
    while (!next.done) {
      events.push(next.value as { type: string; [key: string]: unknown });
      next = await generator.next();
    }
    const result = next.value;

    expect(result.status).toBe('completed');
    const stages = events.filter((e) => e.type === 'stage');
    expect(stages.map((s) => s.label)).toEqual([
      '需求提取',
      '澄清判断',
      '多维度分析',
      '风险评估',
      '综合报告',
    ]);
    expect(stages.map((s) => s.percent)).toEqual([0, 20, 40, 60, 80]);
    expect(stages.every((s) => s.total === 5)).toBe(true);
    const report = events
      .filter((e) => e.type === 'delta')
      .map((e) => e.text)
      .join('');
    expect(report).toContain('多轮澄清');
    expect(report).toContain('长上下文成本');
    expect(report).toContain('需求分析报告');
    // JSON Agent 静默收集：extract/clarify 的输出不应出现在 delta 里
    expect(report).not.toContain('targetUsers');
  });

  it('汇总返回空输出时按失败兜底，不静默透传空报告', async () => {
    const service = makeService(
      {
        '需求抽取 Agent': EXTRACT_JSON,
        '澄清判断 Agent': '{"needsClarification":false,"questions":[]}',
        '需求分析 Agent': '## 功能分解\n- 多轮澄清',
        '风险评估 Agent': '## 技术风险\n- 无',
        '报告汇总 Agent': '   ',
      },
    );

    const result = await service.orchestrate('开发一个会话记忆系统');

    expect(result.status).toBe('failed');
    expect(result.fallback).toBe('manual_review');
    expect(result.report).toBeNull();
    expect(result.steps.at(-1)).toMatchObject({ agent: 'summary', ok: false });
  });

  it('orchestrate(input, retrievedContext)：上下文拼进输入，每个 Agent 都能看到', async () => {
    const model = new ScriptedChatModel({
      '需求抽取 Agent': EXTRACT_JSON,
      '澄清判断 Agent': '{"needsClarification":false,"questions":[]}',
      '需求分析 Agent': '## 功能分解',
      '风险评估 Agent': '## 技术风险',
      '报告汇总 Agent': '# 报告',
    });
    const service = new AgentOrchestratorService({
      chatModel: () => model,
    } as unknown as LlmService);

    const context = '【文档检索上下文】\n[1]（相关度 0.42）\n会话历史持久化到 messages 表';
    const result = await service.orchestrate('开发一个会话记忆系统', context);

    expect(result.status).toBe('completed');
    expect(model.texts.length).toBeGreaterThanOrEqual(5);
    for (const text of model.texts) {
      expect(text).toContain('开发一个会话记忆系统');
      expect(text).toContain('【文档检索上下文】');
    }
  });

  it('retrievedContext 为空白时不拼接，输入保持原样', async () => {
    const model = new ScriptedChatModel({
      '需求抽取 Agent': EXTRACT_JSON,
      '澄清判断 Agent': '{"needsClarification":true,"questions":["给谁用？"]}',
    });
    const service = new AgentOrchestratorService({
      chatModel: () => model,
    } as unknown as LlmService);

    const result = await service.orchestrate('做个系统', '   ');

    expect(result.status).toBe('needs_clarification');
    expect(model.texts[0]).not.toContain('【文档检索上下文】');
    expect(model.texts[0]).toContain('做个系统');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { textOf } from '../messages/text.js';
import { createSubAgents } from '../agents/sub-agents.js';
import { createChatModel } from '../model.factory.js';
import { createAnalysisGraph, runAnalysisGraph } from './requirement-analysis-graph.js';

// runAnalysisGraph 内部经 createChatModel() 构建模型，
// 测试必须拦截工厂，避免真实网络调用
vi.mock('../model.factory.js', () => ({ createChatModel: vi.fn() }));

const AGENT_MARKERS = [
  '需求抽取 Agent',
  '澄清判断 Agent',
  '需求分析 Agent',
  '风险评估 Agent',
  '报告汇总 Agent',
] as const;

type AgentMarker = (typeof AGENT_MARKERS)[number];

const EXTRACT_JSON =
  '{"action":"开发会话记忆系统","targetUsers":"需求分析师","features":["多轮澄清"],"constraints":[],"entities":["会话记忆系统"]}';

const FULL_RESPONSES: Partial<Record<AgentMarker, string>> = {
  '需求抽取 Agent': '```json\n' + EXTRACT_JSON + '\n```',
  '澄清判断 Agent': '{"needsClarification":false,"questions":[]}',
  '需求分析 Agent': '## 功能分解\n- 多轮澄清',
  '风险评估 Agent': '## 技术风险\n- 长上下文成本，等级：中',
  '报告汇总 Agent': '# 需求分析报告\n结论：可行，建议先做 P0。',
};

const CONTEXT = '【文档检索上下文】\n[1]（相关度 0.42）\n会话历史持久化到 messages 表';

class ScriptedChatModel extends SimpleChatModel {
  responses: Partial<Record<AgentMarker, string>>;
  /** 记录每次调用收到的完整提示词文本，供上下文传达断言使用 */
  texts: string[] = [];

  constructor(responses: Partial<Record<AgentMarker, string>>) {
    super({});
    this.responses = responses;
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
    const response = this.responses[marker];
    if (response === undefined) {
      throw new Error(`缺少 ${marker} 的脚本化响应`);
    }
    return response;
  }
}

function scriptedAgentModel(model: ScriptedChatModel): Parameters<typeof createSubAgents>[0] {
  return model as never;
}

describe('requirement-analysis-graph（基线迁移等价性）', () => {
  beforeEach(() => {
    vi.mocked(createChatModel).mockReset();
  });

  it('同样的输入，新图的各阶段产物与旧 Promise 链一致（含 summary 与 steps 记账）', async () => {
    const graphModel = new ScriptedChatModel(FULL_RESPONSES);
    vi.mocked(createChatModel).mockReturnValue(graphModel as never);
    const result = await runAnalysisGraph('开发一个会话记忆系统');

    // 旧链：第六章的直接顺序调用，同样跑一遍作为对照基准
    const chainAgents = createSubAgents(scriptedAgentModel(new ScriptedChatModel(FULL_RESPONSES)));
    const rawExtracted = (await chainAgents.extractAgent.invoke({
      input: '开发一个会话记忆系统',
    })) as string;
    const extracted = JSON.stringify(
      JSON.parse(rawExtracted.slice(rawExtracted.indexOf('{'), rawExtracted.lastIndexOf('}') + 1)),
    );
    const clarified = JSON.parse(
      (await chainAgents.clarifyAgent.invoke({
        input: '开发一个会话记忆系统',
        extracted,
      })) as string,
    );
    const analysis = (await chainAgents.analysisAgent.invoke({
      input: '开发一个会话记忆系统',
      extracted,
    })) as string;
    const risk = (await chainAgents.riskAgent.invoke({
      input: '开发一个会话记忆系统',
      extracted,
    })) as string;
    const summary = (await chainAgents.summaryAgent.invoke({
      input: '开发一个会话记忆系统',
      extracted,
      analysis,
      risk,
    })) as string;

    expect(result.summary).toBe(summary);
    expect(result.extracted).toBe(extracted);
    expect(result.clarified).toEqual(clarified);
    expect(result.analysis).toBe(analysis);
    expect(result.risk).toBe(risk);
    expect(result.summary).toContain('需求分析报告');
    expect(result.steps).toEqual({
      extract: extracted,
      clarify: JSON.stringify(clarified),
      analysis,
      risk,
      summary,
    });
  });

  it('上下文传达与旧链一致：extracted/analysis/risk 按原样喂给下游 Agent', async () => {
    const graphModel = new ScriptedChatModel(FULL_RESPONSES);
    vi.mocked(createChatModel).mockReturnValue(graphModel as never);
    await runAnalysisGraph('开发一个会话记忆系统');

    // 五个节点各触发一次模型调用；summary 节点收到的提示词应包含上游产物
    const prompts = graphModel.texts;
    expect(prompts).toHaveLength(5);
    expect(prompts[1]).toContain(EXTRACT_JSON); // clarify 看到 extracted
    expect(prompts[2]).toContain(EXTRACT_JSON); // analysis 看到 extracted
    expect(prompts[4]).toContain('## 功能分解'); // summary 看到 analysis
    expect(prompts[4]).toContain('长上下文成本'); // summary 看到 risk
  });

  it('retrievedContext 进 State：五个 Agent 都能看到同一份检索上下文', async () => {
    const graphModel = new ScriptedChatModel(FULL_RESPONSES);
    vi.mocked(createChatModel).mockReturnValue(graphModel as never);
    const result = await runAnalysisGraph('开发一个会话记忆系统', CONTEXT);

    expect(graphModel.texts).toHaveLength(5);
    for (const text of graphModel.texts) {
      expect(text).toContain('开发一个会话记忆系统');
      expect(text).toContain('【文档检索上下文】');
    }
    expect(result.retrievedContext).toBe(CONTEXT);
    expect(result.summary).toContain('需求分析报告');
  });

  it('retrievedContext 为空白时不拼接，输入保持原样', async () => {
    const graphModel = new ScriptedChatModel(FULL_RESPONSES);
    vi.mocked(createChatModel).mockReturnValue(graphModel as never);
    await runAnalysisGraph('做个系统', '   ');

    expect(graphModel.texts[0]).not.toContain('【文档检索上下文】');
    expect(graphModel.texts[0]).toContain('做个系统');
  });

  it('clarify 判定需要澄清时提前终止：analysis 及之后不再执行（与旧链提前 return 一致）', async () => {
    const model = new ScriptedChatModel({
      '需求抽取 Agent': EXTRACT_JSON,
      '澄清判断 Agent': '{"needsClarification":true,"questions":["给谁用？"]}',
    });
    const graph = createAnalysisGraph(scriptedAgentModel(model));

    const state = await graph.invoke({ input: '做个系统', retrievedContext: '', messages: [] });

    expect(state.clarified.needsClarification).toBe(true);
    expect(state.analysisText as string | undefined).toBeUndefined();
    expect(state.summaryText as string | undefined).toBeUndefined();
    // 只有 extract 与 clarify 两次模型调用
    expect(model.texts).toHaveLength(2);
  });

  it('每个 Agent 的原始输出按顺序追加进 messages（MessagesAnnotation 追加型 reducer）', async () => {
    const graphModel = new ScriptedChatModel(FULL_RESPONSES);
    const graph = createAnalysisGraph(scriptedAgentModel(graphModel));
    const state = await graph.invoke({
      input: '开发一个会话记忆系统',
      retrievedContext: '',
      messages: [],
    });

    expect(state.messages).toHaveLength(5);
    expect(textOf(state.messages[0].content)).toBe('```json\n' + EXTRACT_JSON + '\n```');
    expect(textOf(state.messages[2].content)).toContain('多轮澄清');
    expect(textOf(state.messages[4].content)).toContain('需求分析报告');
  });

  it('extract 输出非 JSON 时抛错（与旧链一致，由上层编排器兜底）', async () => {
    const model = new ScriptedChatModel({
      '需求抽取 Agent': '抱歉，我无法抽取。',
    });
    const graph = createAnalysisGraph(scriptedAgentModel(model));

    await expect(
      graph.invoke({ input: '做个系统', retrievedContext: '', messages: [] }),
    ).rejects.toThrow(/不包含 JSON/);
    expect(model.texts).toHaveLength(1);
  });
});

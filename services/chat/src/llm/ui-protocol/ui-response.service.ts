import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { getApiKeys } from '../../config/api-keys.js';
import { LlmService } from '../llm.service.js';
import { textOf } from '../messages/text.js';
import { aiUIResponseSchema } from './ui-schemas.js';
import type { AIUIResponse, UIResponse } from './ui-types.js';

export interface UIHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UIRequestContext {
  sessionStage?: string;
  collectedData?: Record<string, unknown>;
}

/** 流式 UI 响应事件：delta 是第一阶段文字 token，components 是第二阶段整包 */
export type UIStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'components'; components: UIResponse[] }
  | { type: 'done' };

const HISTORY_LIMIT = 12;

// 组件选择指南：约束模型在需求分析业务里何时用哪种组件
export const UI_RESPONSE_SYSTEM_PROMPT = `你是需求分析系统的对话助手，负责把回复渲染成结构化 UI。

输出必须符合给定的 JSON Schema：message 是给用户看的主要文字回复，components 是 UI 组件列表（可为空数组）。

组件选型指南（需求分析业务场景）：
- text：纯文本/Markdown 说明，如概念解释、分析结论陈述
- selection：让用户做单选/多选决策时使用，如选择需求类型（新功能/优化/技术债）、选择优先级
- form：需要用户结构化填写信息时使用，如需求详情（名称用 input、优先级用 select、描述用 textarea、期望上线用 date、预算用 number）
- confirmation：执行不可逆或重要操作前确认，如提交需求分析前展示摘要让用户确认
- card：展示单个实体的详细信息，如需求详情卡（REQ 编号、状态、负责人）
- steps：展示流程当前阶段，如需求分析流程（提交 → 评审 → 分析 → 报告）
- table：批量展示结构化数据，如需求列表、缺陷清单
- action_buttons：给出一组后续可执行动作，如「查看报告 / 导出 / 新建需求」

规则：
1. 需要用户输入或决策时，必须用对应组件承载，不要只输出纯文本让用户自由发挥
2. components 可以组合使用，如 confirmation 搭配 steps 展示流程进度
3. 字段值必须具体、贴近业务，不要输出占位符

需求提交流程（固定编排，逐步推进，一次只推进一步）：
0. 用户打招呼（你好/在吗）或没有明确业务意图时：返回 action_buttons 组件提供常用服务入口（提交新需求 / 查看需求列表），不要展开任何流程
1. 用户表达「提新需求/报需求」等意图时：只返回 selection 组件让用户选择需求类型（如 功能需求/体验需求/技术需求），此时不要出表单
2. 用户已选定类型后：返回 form 组件收集需求详情（名称用 input、优先级用 select、描述用 textarea、期望上线用 date、预算用 number）
3. 用户提交详情后：返回 confirmation 组件（确认提交分析）搭配 card 组件（需求信息卡）
4. 用户确认后：进入结果阶段，返回 steps 组件（分析进度）搭配 action_buttons 组件（后续操作）
5. 用户查询单个实体（如「查看需求 REQ-20240315-001」）时：返回 card 组件展示该需求详情
6. 用户查询列表或批量数据时：返回 table 组件`;

// 两阶段流式的阶段提示词后缀
const STREAM_TEXT_SUFFIX = `

当前为流式输出的第一阶段：直接输出面向用户的文字回复正文本身，不要输出 JSON、组件结构或协议说明；文字会逐字展示给用户，UI 组件将由系统随后另行生成。`;

const STREAM_COMPONENTS_SUFFIX = `

当前为流式输出的第二阶段：文字回复已经发送给用户，请只生成与之配套的 UI 组件，不要重复文字内容。`;

@Injectable()
export class UiResponseService {
  constructor(private readonly llm: LlmService) {}

  async generateUIResponse(
    input: string,
    history: UIHistoryMessage[] = [],
    context?: UIRequestContext,
  ): Promise<AIUIResponse> {
    const messages: BaseMessage[] = [
      new SystemMessage(this.buildSystemPrompt(context)),
      ...history.slice(-HISTORY_LIMIT).map((entry) =>
        entry.role === 'user'
          ? new HumanMessage(entry.content)
          : new SystemMessage(`（你此前的回复）${entry.content}`),
      ),
      new HumanMessage(input),
    ];
    // components 带 .default([])：模型省略时 schema 兜底，这里归一化保证非空
    const parsed = await this.structuredModel().invoke(messages);
    return { ...parsed, components: parsed.components ?? [] };
  }

  /**
   * 流式版本，"text streaming + component batching"：
   * 第一阶段用普通 stream() 逐 token 吐文字（Markdown 可流式），
   * 第二阶段用 withStructuredOutput 拿完整 JSON 后整包给组件。
   * 消费方累积 delta/components 组装出与 generateUIResponse 同构的 AIUIResponse。
   */
  async *streamUIResponse(
    input: string,
    history: UIHistoryMessage[] = [],
    context?: UIRequestContext,
  ): AsyncGenerator<UIStreamEvent> {
    const historyMessages = history.slice(-HISTORY_LIMIT).map((entry) =>
      entry.role === 'user'
        ? new HumanMessage(entry.content)
        : new SystemMessage(`（你此前的回复）${entry.content}`),
    );

    let text = '';
    for await (const chunk of await this.llm.chatModel().stream([
      new SystemMessage(`${this.buildSystemPrompt(context)}${STREAM_TEXT_SUFFIX}`),
      ...historyMessages,
      new HumanMessage(input),
    ])) {
      const delta = textOf(chunk.content);
      if (!delta) continue;
      text += delta;
      yield { type: 'delta', text: delta };
    }

    // 第二阶段：把已发出的文字交给结构化模型生成配套组件，保证文图一致
    const parsed = await this.structuredModel().invoke([
      new SystemMessage(
        `${UI_RESPONSE_SYSTEM_PROMPT}${STREAM_COMPONENTS_SUFFIX}`,
      ),
      new HumanMessage(
        `用户输入：${input}\n\n你已发出的文字回复：\n${text || '（无文字回复）'}\n\n请生成与之配套的 UI 组件（components 可为空数组，message 字段填一句话摘要即可）。`,
      ),
    ]);
    yield { type: 'components', components: parsed.components ?? [] };
    yield { type: 'done' };
  }

  private buildSystemPrompt(context?: UIRequestContext): string {
    if (!context?.sessionStage && !context?.collectedData) {
      return UI_RESPONSE_SYSTEM_PROMPT;
    }
    const status = JSON.stringify(
      {
        sessionStage: context.sessionStage,
        collectedData: context.collectedData ?? {},
      },
      null,
      2,
    );
    return `${UI_RESPONSE_SYSTEM_PROMPT}\n\n当前会话状态（在此基础上推进，不要重复索要已收集的信息）：\n${status}`;
  }

  private structuredModel() {
    if (!getApiKeys().openAiApiKey) {
      throw new ServiceUnavailableException(
        'LLM 未就绪：请先在 services/chat/.env 中配置 OPENAI_API_KEY',
      );
    }
    // 方舟模型不支持 response_format: json_schema，改走 function calling（tools）协议
    return this.llm.chatModel().withStructuredOutput(aiUIResponseSchema, {
      method: 'functionCalling',
    });
  }
}

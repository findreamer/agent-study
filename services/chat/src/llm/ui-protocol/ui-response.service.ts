import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { getApiKeys } from '../../config/api-keys.js';
import { LlmService } from '../llm.service.js';
import { aiUIResponseSchema } from './ui-schemas.js';
import type { AIUIResponse } from './ui-types.js';

export interface UIHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UIRequestContext {
  sessionStage?: string;
  collectedData?: Record<string, unknown>;
}

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
1. 用户表达「提新需求/报需求」等意图时：只返回 selection 组件让用户选择需求类型（如 新功能/功能优化/技术优化），此时不要出表单
2. 用户已选定类型后：返回 form 组件收集需求详情（名称用 input、优先级用 select、描述用 textarea、期望上线用 date、预算用 number）
3. 详情齐备后：返回 confirmation 组件展示需求摘要，可搭配 steps 组件标注当前进度
4. 用户查询单个实体（如「查看需求 REQ-20240315-001」）时：返回 card 组件展示该需求详情
5. 用户查询列表或批量数据时：返回 table 组件`;

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

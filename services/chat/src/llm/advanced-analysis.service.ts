import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { AgentOrchestratorService, type AgentStep, type OrchestrationStatus } from './agents/orchestrator.service.js';
import { DbChatMessageHistory } from '../message/db-chat-history.js';
// Nest DI 依赖运行时的 design:paramtypes 元数据，这里必须值导入而非 import type
import { MessageService } from '../message/message.service.js';
import { SearchService } from '../document/search.service.js';
import type { SemanticSearchResult } from '../document/search.service.js';
import { safePath } from './filesystem/workspace.js';

export interface RetrievedDocument {
  content: string;
  score: number;
}

export interface AdvancedAnalysisResult {
  conversationId: string;
  status: OrchestrationStatus;
  clarificationQuestions: string[];
  report: string | null;
  /** 报告文件相对 workspace 根目录的路径，如 reports/analysis-c1-20261006-101030.md */
  reportPath: string | null;
  usedAgents: string[];
  fallback: 'manual_review' | null;
  steps: AgentStep[];
  /** 语义检索命中的用户文档片段（topK=3） */
  retrievedDocuments: RetrievedDocument[];
}

/** 并入编排输入的会话历史上限（human + ai 各计一条） */
const MAX_HISTORY_ENTRIES = 12;
/** 单条历史在转写中的字符上限——AI 长回答截断后保留要点，避免编排输入过重拖垮模型 */
const MAX_ENTRY_CHARS = 400;
/** 语义检索条数（任务书指定 topK=3） */
export const ANALYSIS_TOP_K = 3;

/**
 * 统一分析入口：DbChatHistory 会话历史 + SearchService 语义检索（pgvector）
 * + AgentOrchestratorService 多 Agent 分析，结论以 ASSISTANT 消息持久化。
 */
@Injectable()
export class AdvancedAnalysisService {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly search: SearchService,
    private readonly messages: MessageService,
  ) {}

  async analyze(
    userId: string,
    conversationId: string,
    input: string,
  ): Promise<AdvancedAnalysisResult> {
    const history = new DbChatMessageHistory(conversationId, this.messages);
    const [pastMessages, retrieved] = await Promise.all([
      history.getMessages(),
      this.search.similaritySearch(input, userId, ANALYSIS_TOP_K),
    ]);

    const retrievedContext = this.composeContext(pastMessages, retrieved);
    const result = await this.orchestrator.orchestrate(input, retrievedContext);

    // 用户输入始终落库；分析结论（报告或澄清问题）作为 ASSISTANT 消息持久化
    await history.addMessage(new HumanMessage(input));
    const assistantReply =
      result.status === 'completed'
        ? result.report
        : result.status === 'needs_clarification'
          ? result.clarificationQuestions.map((q) => `澄清：${q}`).join('\n')
          : null;
    if (assistantReply) {
      await history.addMessage(new AIMessage(assistantReply));
    }

    let reportPath: string | null = null;
    if (result.status === 'completed' && result.report !== null) {
      reportPath = await this.writeReport(conversationId, input, result.report);
    }

    return {
      conversationId,
      status: result.status,
      clarificationQuestions: result.clarificationQuestions,
      report: result.report,
      reportPath,
      usedAgents: result.usedAgents,
      fallback: result.fallback,
      steps: result.steps,
      retrievedDocuments: retrieved.map(({ content, score }) => ({ content, score })),
    };
  }

  /** 会话历史与检索片段各自成块拼为 retrievedContext；两者皆空时返回空串 */
  private composeContext(
    pastMessages: BaseMessage[],
    retrieved: SemanticSearchResult[],
  ): string {
    const blocks: string[] = [];
    if (pastMessages.length > 0) {
      const transcript = pastMessages
        .slice(-MAX_HISTORY_ENTRIES)
        .map(
          (message) =>
            `${message.getType() === 'human' ? '用户' : '助手'}：${String(message.content).slice(0, MAX_ENTRY_CHARS)}`,
        )
        .join('\n');
      blocks.push(`【会话历史】\n${transcript}`);
    }
    if (retrieved.length > 0) {
      const docs = retrieved
        .map(
          (doc, i) =>
            `[${i + 1}]（相关度 ${doc.score.toFixed(2)}）\n${doc.content.slice(0, MAX_ENTRY_CHARS)}`,
        )
        .join('\n\n');
      blocks.push(`【文档检索上下文】\n${docs}`);
    }
    return blocks.join('\n\n');
  }

  private async writeReport(
    conversationId: string,
    input: string,
    report: string,
  ): Promise<string> {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 14);
    const safeId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const relative = `reports/analysis-${safeId}-${stamp}.md`;
    const absolute = safePath(relative);

    await fs.mkdir(path.dirname(absolute), { recursive: true });
    const content = [
      `# 需求分析报告`,
      ``,
      `- 会话：${conversationId}`,
      `- 生成时间：${new Date().toLocaleString('zh-CN')}`,
      `- 触发输入：${input}`,
      ``,
      '---',
      '',
      report,
      '',
    ].join('\n');
    await fs.writeFile(absolute, content, 'utf8');
    return relative;
  }
}

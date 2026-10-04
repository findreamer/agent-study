import { Injectable } from '@nestjs/common';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AgentOrchestratorService, type AgentStep, type OrchestrationStatus } from './agents/orchestrator.service.js';
import { RunnableMemoryService } from './memory/runnable-memory.service.js';
import { safePath } from './filesystem/workspace.js';

export interface AdvancedAnalysisResult {
  sessionId: string;
  status: OrchestrationStatus;
  clarificationQuestions: string[];
  report: string | null;
  /** 报告文件相对 workspace 根目录的路径，如 reports/analysis-s1-20261004-171030.md */
  reportPath: string | null;
  usedAgents: string[];
  fallback: 'manual_review' | null;
  steps: AgentStep[];
  /** 写回记忆后的会话消息条数（human + ai 各计一条） */
  historyCount: number | null;
}

/** 并入编排输入的会话历史上限（human + ai 各计一条） */
const MAX_HISTORY_ENTRIES = 12;
/** 单条历史在转写中的字符上限——AI 长回答截断后保留要点，避免编排输入过重拖垮模型 */
const MAX_ENTRY_CHARS = 400;

@Injectable()
export class AdvancedAnalysisService {
  constructor(
    private readonly orchestrator: AgentOrchestratorService,
    private readonly memory: RunnableMemoryService,
  ) {}

  /**
   * 统一入口：多 Agent 分析 + 报告落盘 + 会话记忆写回。
   * 编排输入会并入该会话的历史对话，让第四轮的"产出报告"能引用前三轮积累的需求信息。
   */
  async analyze(sessionId: string, input: string): Promise<AdvancedAnalysisResult> {
    const composedInput = await this.composeInput(sessionId, input);
    const result = await this.orchestrator.orchestrate(composedInput);

    // status 与 report 是独立字段，TS 无法跨字段收窄，显式判空
    if (result.status !== 'completed' || result.report === null) {
      return {
        sessionId,
        status: result.status,
        clarificationQuestions: result.clarificationQuestions,
        report: null,
        reportPath: null,
        usedAgents: result.usedAgents,
        fallback: result.fallback,
        steps: result.steps,
        historyCount: null,
      };
    }

    const reportPath = await this.writeReport(sessionId, input, result.report);

    // 直接写回最终结论，不重新调用模型
    await this.memory.appendMessage(sessionId, input, result.report);
    const history = await this.memory.getHistory(sessionId);

    return {
      sessionId,
      status: result.status,
      clarificationQuestions: [],
      report: result.report,
      reportPath,
      usedAgents: result.usedAgents,
      fallback: null,
      steps: result.steps,
      historyCount: history.length,
    };
  }

  /** 拉取会话历史并拼入编排输入；无历史时原样返回。 */
  private async composeInput(sessionId: string, input: string): Promise<string> {
    const history = await this.memory.getHistory(sessionId);
    if (history.length === 0) {
      return input;
    }
    const transcript = history
      .slice(-MAX_HISTORY_ENTRIES)
      .map(
        (entry) =>
          `${entry.role === 'human' ? '用户' : '助手'}：${entry.content.slice(0, MAX_ENTRY_CHARS)}`,
      )
      .join('\n');
    return `【会话历史】\n${transcript}\n\n【当前请求】\n${input}`;
  }

  private async writeReport(sessionId: string, input: string, report: string): Promise<string> {
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T]/g, '')
      .slice(0, 14);
    const safeSession = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const relative = `reports/analysis-${safeSession}-${stamp}.md`;
    const absolute = safePath(relative);

    await fs.mkdir(path.dirname(absolute), { recursive: true });
    const content = [
      `# 需求分析报告`,
      ``,
      `- 会话：${sessionId}`,
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

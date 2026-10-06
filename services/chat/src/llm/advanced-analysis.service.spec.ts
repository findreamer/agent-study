import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import type { AgentOrchestratorService, OrchestrationResult } from './agents/orchestrator.service.js';
import type { MessageService } from '../message/message.service.js';
import type { SearchService } from '../document/search.service.js';
import { AdvancedAnalysisService } from './advanced-analysis.service.js';

const COMPLETED_RESULT: OrchestrationResult = {
  mode: 'fixed_workflow',
  status: 'completed',
  clarificationQuestions: [],
  usedAgents: ['extract', 'clarify', 'analysis', 'risk', 'summary'],
  fallback: null,
  steps: [],
  report: '# 需求分析报告\n结论：可行。',
};

const REPORT = COMPLETED_RESULT.report!;

function makeMessages(history: BaseMessage[] = []) {
  return {
    getHistoryAsLangChainMessages: vi.fn().mockResolvedValue(history),
    addMessage: vi.fn().mockResolvedValue({}),
  } as unknown as MessageService;
}

function makeSearch(results: Array<{ content: string; score: number }> = []) {
  return {
    similaritySearch: vi.fn().mockResolvedValue(results),
  } as unknown as SearchService;
}

function makeOrchestrator(result: OrchestrationResult = COMPLETED_RESULT) {
  return {
    orchestrate: vi.fn().mockResolvedValue(result),
  } as unknown as AgentOrchestratorService;
}

function makeService(
  orchestrator: AgentOrchestratorService,
  search: SearchService,
  messages: MessageService,
) {
  return new AdvancedAnalysisService(orchestrator, search, messages);
}

describe('AdvancedAnalysisService.analyze（统一分析入口）', () => {
  let workspaceDir: string;
  let originalWorkspaceDir: string | undefined;

  beforeEach(() => {
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'advanced-ws-'));
    originalWorkspaceDir = process.env.WORKSPACE_DIR;
    process.env.WORKSPACE_DIR = workspaceDir;
  });

  afterEach(() => {
    if (originalWorkspaceDir === undefined) {
      delete process.env.WORKSPACE_DIR;
    } else {
      process.env.WORKSPACE_DIR = originalWorkspaceDir;
    }
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  });

  it('检索以 (input, userId, 3) 调用；历史与检索上下文拼接后传给编排器', async () => {
    const messages = makeMessages([
      new HumanMessage('我想做一个会话记忆系统'),
      new AIMessage('好的，请补充目标用户'),
    ]);
    const search = makeSearch([
      { content: '会话历史需要持久化到 messages 表', score: 0.42 },
      { content: '支持断线重连', score: 0.21 },
    ]);
    const orchestrator = makeOrchestrator();
    const service = makeService(orchestrator, search, messages);

    await service.analyze('u1', 'c1', '帮我判断需求是否完整');

    expect(search.similaritySearch).toHaveBeenCalledWith('帮我判断需求是否完整', 'u1', 3);

    expect(orchestrator.orchestrate).toHaveBeenCalledTimes(1);
    const [input, context] = vi.mocked(orchestrator.orchestrate).mock.calls[0]!;
    expect(input).toBe('帮我判断需求是否完整');
    expect(context).toContain('【会话历史】');
    expect(context).toContain('我想做一个会话记忆系统');
    expect(context).toContain('【文档检索上下文】');
    expect(context).toContain('会话历史需要持久化到 messages 表');
    expect(context).toContain('0.42');
  });

  it('无历史且无检索结果时，上下文为空串，编排器只收到当前输入', async () => {
    const orchestrator = makeOrchestrator();
    const service = makeService(orchestrator, makeSearch(), makeMessages());

    await service.analyze('u1', 'c1', '做个系统');

    expect(orchestrator.orchestrate).toHaveBeenCalledWith('做个系统', '');
  });

  it('completed：用户输入与报告分别以 USER/ASSISTANT 落 messages 表，报告落盘并返回检索文档', async () => {
    const messages = makeMessages();
    const search = makeSearch([{ content: '报告以 ASSISTANT 消息持久化', score: 0.33 }]);
    const service = makeService(makeOrchestrator(), search, messages);

    const result = await service.analyze('u1', 'c1', '帮我产出需求分析报告');

    expect(result.conversationId).toBe('c1');
    expect(result.status).toBe('completed');
    expect(result.report).toBe(REPORT);
    expect(result.usedAgents).toEqual(COMPLETED_RESULT.usedAgents);
    expect(result.reportPath).toMatch(/^reports[/\\].+\.md$/);
    expect(result.retrievedDocuments).toEqual([
      { content: '报告以 ASSISTANT 消息持久化', score: 0.33 },
    ]);

    expect(messages.addMessage).toHaveBeenCalledWith('c1', 'USER', '帮我产出需求分析报告');
    expect(messages.addMessage).toHaveBeenCalledWith('c1', 'ASSISTANT', REPORT);

    const reportFile = path.join(workspaceDir, result.reportPath!);
    expect(fs.existsSync(reportFile)).toBe(true);
    expect(fs.readFileSync(reportFile, 'utf8')).toContain('结论：可行');
  });

  it('needs_clarification：写入用户输入与澄清问题，不落报告文件', async () => {
    const messages = makeMessages();
    const orchestrator = makeOrchestrator({
      ...COMPLETED_RESULT,
      status: 'needs_clarification',
      clarificationQuestions: ['这个系统给谁用？'],
      report: null,
    });
    const service = makeService(orchestrator, makeSearch(), messages);

    const result = await service.analyze('u1', 'c1', '做个系统');

    expect(result.status).toBe('needs_clarification');
    expect(result.report).toBeNull();
    expect(result.reportPath).toBeNull();
    expect(messages.addMessage).toHaveBeenCalledWith('c1', 'USER', '做个系统');
    expect(messages.addMessage).toHaveBeenCalledWith('c1', 'ASSISTANT', '澄清：这个系统给谁用？');
    expect(fs.existsSync(path.join(workspaceDir, 'reports'))).toBe(false);
  });

  it('failed：只落用户输入，返回 manual_review 兜底', async () => {
    const messages = makeMessages();
    const orchestrator = makeOrchestrator({
      ...COMPLETED_RESULT,
      status: 'failed',
      fallback: 'manual_review',
      report: null,
    });
    const service = makeService(orchestrator, makeSearch(), messages);

    const result = await service.analyze('u1', 'c1', '帮我产出报告');

    expect(result.status).toBe('failed');
    expect(result.fallback).toBe('manual_review');
    expect(result.report).toBeNull();
    expect(messages.addMessage).toHaveBeenCalledTimes(1);
    expect(messages.addMessage).toHaveBeenCalledWith('c1', 'USER', '帮我产出报告');
  });

  it('超长历史与检索片段在拼接时截断，避免编排输入过重', async () => {
    const messages = makeMessages([
      new HumanMessage('我想做一个会话记忆系统'),
      new AIMessage('很长的分析'.repeat(200)),
    ]);
    const search = makeSearch([{ content: '很长的文档'.repeat(300), score: 0.5 }]);
    const orchestrator = makeOrchestrator();
    const service = makeService(orchestrator, search, messages);

    await service.analyze('u1', 'c1', '帮我产出报告');

    const [, context] = vi.mocked(orchestrator.orchestrate).mock.calls[0]!;
    expect(context!.length).toBeLessThan(1600);
    expect(context).toContain('我想做一个会话记忆系统');
  });
});

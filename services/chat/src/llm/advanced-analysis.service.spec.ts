import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentOrchestratorService, OrchestrationResult } from './agents/orchestrator.service.js';
import type { HistoryEntry } from './memory/runnable-memory.service.js';
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

class FakeOrchestrator {
  calls: string[] = [];
  result: OrchestrationResult = COMPLETED_RESULT;

  async orchestrate(input: string): Promise<OrchestrationResult> {
    this.calls.push(input);
    return this.result;
  }
}

class FakeMemory {
  history: HistoryEntry[] = [];
  appended: Array<{ sessionId: string; human: string; ai: string }> = [];

  async getHistory(sessionId: string): Promise<HistoryEntry[]> {
    return this.history;
  }

  async appendMessage(sessionId: string, human: string, ai: string): Promise<void> {
    this.appended.push({ sessionId, human, ai });
  }
}

function makeService(orchestrator: FakeOrchestrator, memory: FakeMemory) {
  return new AdvancedAnalysisService(
    orchestrator as unknown as AgentOrchestratorService,
    memory as never,
  );
}

describe('AdvancedAnalysisService', () => {
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

  it('完成后把报告写入 reports/ 目录并写回会话记忆', async () => {
    const orchestrator = new FakeOrchestrator();
    const memory = new FakeMemory();
    const service = makeService(orchestrator, memory);

    const result = await service.analyze('s1', '帮我产出需求分析报告');

    expect(result.status).toBe('completed');
    expect(result.report).toContain('需求分析报告');
    expect(result.reportPath).toMatch(/^reports[/\\].+\.md$/);

    const reportFile = path.join(workspaceDir, result.reportPath!);
    expect(fs.existsSync(reportFile)).toBe(true);
    expect(fs.readFileSync(reportFile, 'utf8')).toContain('结论：可行');

    expect(memory.appended).toHaveLength(1);
    expect(memory.appended[0]).toMatchObject({
      sessionId: 's1',
      human: '帮我产出需求分析报告',
      ai: COMPLETED_RESULT.report,
    });
  });

  it('会话有历史时，把历史上下文并入传给编排器的输入', async () => {
    const orchestrator = new FakeOrchestrator();
    const memory = new FakeMemory();
    memory.history = [
      { role: 'human', content: '我想做一个会话记忆系统' },
      { role: 'ai', content: '好的，请补充目标用户' },
    ];
    const service = makeService(orchestrator, memory);

    await service.analyze('s1', '帮我判断需求是否完整');

    expect(orchestrator.calls).toHaveLength(1);
    expect(orchestrator.calls[0]).toContain('【会话历史】');
    expect(orchestrator.calls[0]).toContain('我想做一个会话记忆系统');
    expect(orchestrator.calls[0]).toContain('【当前请求】');
    expect(orchestrator.calls[0]).toContain('帮我判断需求是否完整');
  });

  it('会话无历史时，原样传给编排器', async () => {
    const orchestrator = new FakeOrchestrator();
    const service = makeService(orchestrator, new FakeMemory());

    await service.analyze('s1', '帮我判断需求是否完整');

    expect(orchestrator.calls[0]).toBe('帮我判断需求是否完整');
  });

  it('超长历史条目在转写时被截断，避免编排输入过重', async () => {
    const orchestrator = new FakeOrchestrator();
    const memory = new FakeMemory();
    memory.history = [
      { role: 'human', content: '我想做一个会话记忆系统' },
      { role: 'ai', content: '很长的分析'.repeat(200) },
    ];
    const service = makeService(orchestrator, memory);

    await service.analyze('s1', '帮我产出报告');

    expect(orchestrator.calls[0]).toContain('我想做一个会话记忆系统');
    expect(orchestrator.calls[0]!.length).toBeLessThan(1200);
  });

  it('需要澄清时直接返回澄清问题，不写文件也不写记忆', async () => {
    const orchestrator = new FakeOrchestrator();
    orchestrator.result = {
      ...COMPLETED_RESULT,
      status: 'needs_clarification',
      clarificationQuestions: ['这个系统给谁用？'],
      report: null,
    };
    const memory = new FakeMemory();
    const service = makeService(orchestrator, memory);

    const result = await service.analyze('s1', '做个系统');

    expect(result.status).toBe('needs_clarification');
    expect(result.clarificationQuestions).toEqual(['这个系统给谁用？']);
    expect(result.report).toBeNull();
    expect(result.reportPath).toBeNull();
    expect(memory.appended).toHaveLength(0);

    const reportsDir = path.join(workspaceDir, 'reports');
    expect(fs.existsSync(reportsDir)).toBe(false);
  });

  it('编排失败时返回 fallback manual_review，不写文件', async () => {
    const orchestrator = new FakeOrchestrator();
    orchestrator.result = {
      ...COMPLETED_RESULT,
      status: 'failed',
      fallback: 'manual_review',
      report: null,
    };
    const service = makeService(orchestrator, new FakeMemory());

    const result = await service.analyze('s1', '帮我产出报告');

    expect(result.status).toBe('failed');
    expect(result.fallback).toBe('manual_review');
    expect(result.report).toBeNull();
    expect(result.reportPath).toBeNull();
  });
});

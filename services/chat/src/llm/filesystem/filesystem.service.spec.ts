import { AIMessage } from '@langchain/core/messages';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatModel } from '../model.factory.js';
import { FilesystemService } from './filesystem.service.js';

vi.mock('../model.factory.js', () => ({ createChatModel: vi.fn() }));

function fakeModel(scripted: AIMessage[]) {
  const queue = [...scripted];
  return {
    bindTools: vi.fn(() => ({
      invoke: vi.fn(async () => queue.shift() ?? new AIMessage('')),
    })),
    invoke: vi.fn(async () => new AIMessage('兜底回答')),
  };
}

function toolCallMessage(): AIMessage {
  return new AIMessage({
    content: '',
    tool_calls: [
      {
        name: 'query_requirement',
        args: { requirementId: 'REQ-2026-001' },
        id: 'call_1',
        type: 'tool_call',
      },
    ],
  });
}

describe('FilesystemService', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  let workspaceDir: string;
  let originalWorkspaceDir: string | undefined;

  beforeEach(() => {
    vi.mocked(createChatModel).mockReset();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'ws-svc-'));
    originalWorkspaceDir = process.env.WORKSPACE_DIR;
    process.env.WORKSPACE_DIR = workspaceDir;
    mkdirSync(path.join(workspaceDir, 'requirements'), { recursive: true });
    writeFileSync(
      path.join(workspaceDir, 'requirements', 'REQ-2026-001.json'),
      JSON.stringify({ id: 'REQ-2026-001', title: '需求分析助手' }),
    );
  });

  afterEach(() => {
    if (originalWorkspaceDir === undefined) delete process.env.WORKSPACE_DIR;
    else process.env.WORKSPACE_DIR = originalWorkspaceDir;
  });

  it('chat：模型请求查需求单，工具真实执行并回填，最终输出文本', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.mocked(createChatModel).mockReturnValue(
      fakeModel([toolCallMessage(), new AIMessage('该需求单包含需求分析助手条目')]) as never,
    );
    const service = new FilesystemService();

    const result = await service.chat('查询需求单 REQ-2026-001 的详情');

    expect(result.output).toBe('该需求单包含需求分析助手条目');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.tool).toBe('query_requirement');
    expect(result.steps[0]?.result).toContain('需求分析助手');
  });

  it('chat：写入请求真实落盘', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const writeCall = new AIMessage({
      content: '',
      tool_calls: [
        {
          name: 'write_file',
          args: { path: 'reports/x.md', content: '# 结论' },
          id: 'call_w',
          type: 'tool_call',
        },
      ],
    });
    vi.mocked(createChatModel).mockReturnValue(
      fakeModel([writeCall, new AIMessage('已写入')]) as never,
    );
    const service = new FilesystemService();

    const result = await service.chat('把结论写入 reports/x.md');

    expect(result.steps[0]?.result).toContain('"ok":true');
    expect(
      readFileSync(path.join(workspaceDir, 'reports', 'x.md'), 'utf-8'),
    ).toBe('# 结论');
  });

  it('缺少 OPENAI_API_KEY 时抛 503 语义错误', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new FilesystemService();
    await expect(service.chat('任意输入')).rejects.toThrow(/OPENAI_API_KEY/);
    expect(createChatModel).not.toHaveBeenCalled();
  });
});

import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseMessage } from '@langchain/core/messages';
import { createChatModel } from '../model.factory.js';
import { RunnableMemoryService } from './runnable-memory.service.js';

vi.mock('../model.factory.js', () => ({ createChatModel: vi.fn() }));

class CapturingModel extends SimpleChatModel {
  captured: BaseMessage[][] = [];
  responses: string[];
  private index = 0;

  constructor(responses: string[]) {
    super({});
    this.responses = responses;
  }

  async _call(messages: BaseMessage[]): Promise<string> {
    this.captured.push(messages);
    return this.responses[this.index++] ?? '默认回复';
  }

  _llmType(): string {
    return 'capturing_test_model';
  }
}

function contents(messages: BaseMessage[]): string[] {
  return messages.map((message) => String(message.content));
}

describe('RunnableMemoryService', () => {
  const originalKey = process.env.OPENAI_API_KEY;
  let service: RunnableMemoryService;

  beforeEach(() => {
    vi.mocked(createChatModel).mockReset();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    service = new RunnableMemoryService();
    service.clearSession('s1');
    service.clearSession('s2');
  });

  describe('历史管理', () => {
    it('appendMessage + getHistory 回读', async () => {
      await service.appendMessage('s1', '你好，我想提需求', '好的，请讲');
      const history = await service.getHistory('s1');
      expect(history).toEqual([
        { role: 'human', content: '你好，我想提需求' },
        { role: 'ai', content: '好的，请讲' },
      ]);
    });

    it('sessionId 隔离：两个会话互不可见', async () => {
      await service.appendMessage('s1', '会话一', '回复一');
      await service.appendMessage('s2', '会话二', '回复二');
      expect(await service.getHistory('s1')).toHaveLength(2);
      expect(await service.getHistory('s2')).toHaveLength(2);
      expect((await service.getHistory('s1'))[0]?.content).toBe('会话一');
      expect((await service.getHistory('s2'))[0]?.content).toBe('会话二');
    });

    it('clearSession 只清除目标会话', async () => {
      await service.appendMessage('s1', 'a', 'b');
      await service.appendMessage('s2', 'c', 'd');
      expect(service.clearSession('s1')).toBe(true);
      expect(await service.getHistory('s1')).toEqual([]);
      expect(await service.getHistory('s2')).toHaveLength(2);
      expect(service.clearSession('s1')).toBe(false);
    });

    it('未初始化会话 getHistory 返回空数组', async () => {
      expect(await service.getHistory('never')).toEqual([]);
    });
  });

  describe('chat 多轮对话', () => {
    it('第二轮调用能收到第一轮的人机消息', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const model = new CapturingModel(['第一轮回复', '第二轮回复']);
      vi.mocked(createChatModel).mockReturnValue(model as never);

      await service.chat('s1', '我们想做一个需求分析助手');
      await service.chat('s1', '需求单号是 REQ-2026-001');

      const round2 = contents(model.captured[1] ?? []);
      expect(round2).toContain('我们想做一个需求分析助手');
      expect(round2).toContain('第一轮回复');
      expect(round2).toContain('需求单号是 REQ-2026-001');
    });

    it('chat 自动把人机消息写入会话历史', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      vi.mocked(createChatModel).mockReturnValue(
        new CapturingModel(['收到']) as never,
      );
      await service.chat('s1', '你好');
      expect(await service.getHistory('s1')).toEqual([
        { role: 'human', content: '你好' },
        { role: 'ai', content: '收到' },
      ]);
    });

    it('chat 的会话隔离：s2 看不到 s1 的消息', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const model = new CapturingModel(['回复一', '回复二']);
      vi.mocked(createChatModel).mockReturnValue(model as never);
      await service.chat('s1', '只在会话一说过的话');
      await service.chat('s2', '会话二的输入');
      expect(contents(model.captured[1] ?? [])).not.toContain(
        '只在会话一说过的话',
      );
    });

    it('缺少 OPENAI_API_KEY 时 chat 抛 503 语义错误', async () => {
      delete process.env.OPENAI_API_KEY;
      await expect(service.chat('s1', '你好')).rejects.toThrow(
        /OPENAI_API_KEY/,
      );
    });
  });

  describe('trimMessages 裁剪版本', () => {
    it('超长历史被裁剪，仅保留最近消息', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const model = new CapturingModel(['裁剪后的回复']);
      vi.mocked(createChatModel).mockReturnValue(model as never);
      const longText = '长'.repeat(3000);
      await service.appendMessage('s1', longText, '很久以前的回复');
      await service.appendMessage('s1', '最近的消息', '最近的回复');

      await service.chat('s1', '新输入', { trim: true });

      const seen = contents(model.captured[0] ?? []).join('\n');
      expect(seen).toContain('最近的消息');
      expect(seen).toContain('新输入');
      expect(seen).not.toContain(longText.slice(0, 100));
    });

    it('trim: false 时超长历史仍然完整进入提示', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      const model = new CapturingModel(['不裁剪的回复']);
      vi.mocked(createChatModel).mockReturnValue(model as never);
      const longText = '长'.repeat(3000);
      await service.appendMessage('s1', longText, '很久以前的回复');

      await service.chat('s1', '新输入');

      const seen = contents(model.captured[0] ?? []).join('\n');
      expect(seen).toContain(longText.slice(0, 100));
    });
  });
});

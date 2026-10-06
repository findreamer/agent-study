import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseMessage } from '@langchain/core/messages';
import { LlmService } from '../llm.service.js';
import { UI_RESPONSE_SYSTEM_PROMPT, UiResponseService } from './ui-response.service.js';
import { aiUIResponseSchema, uiResponseSchema } from './ui-schemas.js';
import type { AIUIResponse } from './ui-types.js';

const CANNED: AIUIResponse = {
  message: '好的，请先选择需求类型。',
  components: [
    {
      type: 'selection',
      title: '请选择需求类型',
      options: [
        { id: 'feature', label: '新功能' },
        { id: 'optimization', label: '功能优化' },
      ],
    },
  ],
};

function makeService(canned: AIUIResponse) {
  const structuredInvoke = vi.fn().mockResolvedValue(canned);
  const structuredFactory = vi
    .fn()
    .mockReturnValue({ invoke: structuredInvoke });
  const chatModel = vi.fn().mockReturnValue({ withStructuredOutput: structuredFactory });
  const llm = { chatModel } as unknown as LlmService;
  return { service: new UiResponseService(llm), structuredFactory, structuredInvoke, chatModel };
}

describe('UiResponseService', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('withStructuredOutput 绑定 aiUIResponseSchema，走 functionCalling 协议', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { service, structuredFactory } = makeService(CANNED);

    const result = await service.generateUIResponse('我要提一个新需求');

    expect(result).toEqual(CANNED);
    expect(structuredFactory).toHaveBeenCalledWith(aiUIResponseSchema, {
      method: 'functionCalling',
    });
  });

  it('消息结构：system 组件指南 → 历史 → 当前输入，上下文注入 system', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { service, structuredInvoke } = makeService(CANNED);

    await service.generateUIResponse(
      '继续',
      [
        { role: 'user', content: '我要提一个新需求' },
        { role: 'assistant', content: '请选择需求类型' },
      ],
      { sessionStage: 'collect_details', collectedData: { requirementType: '新功能' } },
    );

    const messages = structuredInvoke.mock.calls[0][0] as BaseMessage[];
    expect(messages).toHaveLength(4);
    expect(messages[0].getType()).toBe('system');
    expect(String(messages[0].content)).toContain('组件选型指南');
    expect(String(messages[0].content)).toContain('collect_details');
    expect(String(messages[0].content)).toContain('新功能');
    expect(String(messages[1].content)).toContain('我要提一个新需求');
    expect(String(messages[2].content)).toContain('请选择需求类型');
    expect(messages[3].getType()).toBe('human');
    expect(String(messages[3].content)).toBe('继续');
  });

  it('无上下文时 system 提示词不追加会话状态', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { service, structuredInvoke } = makeService(CANNED);

    await service.generateUIResponse('查看需求 REQ-20240315-001');

    const messages = structuredInvoke.mock.calls[0][0] as BaseMessage[];
    expect(messages).toHaveLength(2);
    expect(String(messages[0].content)).toBe(UI_RESPONSE_SYSTEM_PROMPT);
  });

  it('历史超过上限时只保留最近 12 条', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { service, structuredInvoke } = makeService(CANNED);
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: 'user' as const,
      content: `历史消息 ${i}`,
    }));

    await service.generateUIResponse('当前输入', history);

    const messages = structuredInvoke.mock.calls[0][0] as BaseMessage[];
    // system + 最近 12 条历史 + 当前输入
    expect(messages).toHaveLength(14);
    expect(String(messages[1].content)).toContain('历史消息 18');
    expect(String(messages[1].content)).not.toContain('历史消息 17');
  });

  it('缺少 OPENAI_API_KEY 时返回 503 语义错误', async () => {
    delete process.env.OPENAI_API_KEY;
    const { service } = makeService(CANNED);
    await expect(service.generateUIResponse('任意输入')).rejects.toThrow(
      /OPENAI_API_KEY/,
    );
  });
});

describe('ui-protocol schema 自检', () => {
  it('aiUIResponseSchema 接受合法结构化回复、拒绝未知组件类型', () => {
    expect(aiUIResponseSchema.safeParse(CANNED).success).toBe(true);
    expect(
      aiUIResponseSchema.safeParse({
        message: 'x',
        components: [{ type: 'unknown_widget', foo: 1 }],
      }).success,
    ).toBe(false);
  });

  it('uiResponseSchema 按 type 精确匹配各组件', () => {
    expect(
      uiResponseSchema.safeParse({ type: 'text', content: '说明' }).success,
    ).toBe(true);
    expect(
      uiResponseSchema.safeParse({
        type: 'form',
        title: '表单',
        fields: [{ name: 'priority', label: '优先级', type: 'select' }],
      }).success,
    ).toBe(true);
    expect(
      uiResponseSchema.safeParse({ type: 'text' }).success,
    ).toBe(false);
  });
});

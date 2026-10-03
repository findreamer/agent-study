import { AIMessage } from '@langchain/core/messages';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatModel } from './model.factory.js';
import { LlmService } from './llm.service.js';

vi.mock('./model.factory.js', () => ({ createChatModel: vi.fn() }));

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
        name: 'lookup_entity_definition',
        args: { entity: '手机号' },
        id: 'call_1',
        type: 'tool_call',
      },
    ],
  });
}

describe('LlmService 工具调用', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.mocked(createChatModel).mockReset();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('bindToolsOnce：模型发起 tool_calls 时原样返回', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.mocked(createChatModel).mockReturnValue(
      fakeModel([toolCallMessage()]) as never,
    );
    const service = new LlmService();

    const result = await service.bindToolsOnce('用户注册时必须绑定手机号，密码至少8位');

    expect(result).toEqual({
      kind: 'tool_calls',
      toolCalls: [{ name: 'lookup_entity_definition', args: { entity: '手机号' } }],
    });
  });

  it('runToolLoop：执行工具并回填 ToolMessage，最终返回文本', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const fake = fakeModel([
      toolCallMessage(),
      new AIMessage('最终结构化需求说明'),
    ]);
    vi.mocked(createChatModel).mockReturnValue(fake as never);
    const service = new LlmService();

    const result = await service.runToolLoop('用户注册时必须绑定手机号，密码至少8位');

    expect(result.output).toBe('最终结构化需求说明');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.tool).toBe('lookup_entity_definition');
    expect(result.steps[0]?.result).toContain('联系方式');
    expect(fake.bindTools).toHaveBeenCalledTimes(2);
  });

  it('runToolLoop：未知工具名得到占位结果而非崩溃', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const unknown = new AIMessage({
      content: '',
      tool_calls: [
        { name: 'no_such_tool', args: {}, id: 'call_x', type: 'tool_call' },
      ],
    });
    vi.mocked(createChatModel).mockReturnValue(
      fakeModel([unknown, new AIMessage('完成')]) as never,
    );
    const service = new LlmService();

    const result = await service.runToolLoop('任意输入');

    expect(result.steps[0]?.result).toContain('未知工具');
    expect(result.output).toBe('完成');
  });
});

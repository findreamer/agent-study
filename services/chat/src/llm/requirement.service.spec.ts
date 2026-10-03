import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequirementResultSchema } from '@agent-study/contracts';
import { createChatModel } from './model.factory.js';
import { RequirementService } from './requirement.service.js';

vi.mock('./model.factory.js', () => ({ createChatModel: vi.fn() }));

const CANNED = {
  action: '用户注册',
  constraints: ['必须绑定手机号', '密码至少8位'],
  entities: ['用户', '手机号', '密码'],
};

function mockStructuredModel() {
  const structuredInvoke = vi.fn().mockResolvedValue(CANNED);
  const structuredFactory = vi.fn().mockReturnValue({ invoke: structuredInvoke });
  const model = { withStructuredOutput: structuredFactory };
  vi.mocked(createChatModel).mockReturnValue(model as never);
  return { structuredInvoke, structuredFactory };
}

describe('RequirementService', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.mocked(createChatModel).mockReset();
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('extract：formatMessages → withStructuredOutput → 返回结构化结果', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const { structuredInvoke, structuredFactory } = mockStructuredModel();
    const service = new RequirementService();

    const result = await service.extract('用户注册时必须绑定手机号，密码至少8位');

    expect(result).toEqual(CANNED);
    expect(structuredFactory).toHaveBeenCalledWith(RequirementResultSchema, {
      method: 'functionCalling',
    });
    const messages = structuredInvoke.mock.calls[0][0] as Array<{
      getType: () => string;
      content: unknown;
    }>;
    expect(messages).toHaveLength(2);
    expect(messages[0].getType()).toBe('system');
    expect(messages[1].getType()).toBe('human');
    expect(String(messages[1].content)).toContain('用户注册时必须绑定手机号，密码至少8位');
  });

  it('缺少 OPENAI_API_KEY 时返回 503 语义错误', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new RequirementService();
    await expect(service.extract('任意输入')).rejects.toThrow(/OPENAI_API_KEY/);
    expect(createChatModel).not.toHaveBeenCalled();
  });

  it('契约自检：RequirementResultSchema 接受合法结果、拒绝缺字段', () => {
    expect(RequirementResultSchema.safeParse(CANNED).success).toBe(true);
    expect(
      RequirementResultSchema.safeParse({ action: 'x', constraints: [] }).success,
    ).toBe(false);
  });
});

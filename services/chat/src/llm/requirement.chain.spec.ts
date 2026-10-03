import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { ChatOpenAI } from '@langchain/openai';
import { requirementChain } from './requirement.chain.js';

describe('requirementChain', () => {
  it('invoke：模板 → 模型 → 字符串输出', async () => {
    const fake = new FakeListChatModel({ responses: ['结构化结果A'] });
    const result = await requirementChain(fake as unknown as ChatOpenAI).invoke({
      input: '用户注册时必须绑定手机号，密码至少8位',
    });
    expect(result).toBe('结构化结果A');
  });

  it('batch：多条输入按序返回', async () => {
    const fake = new FakeListChatModel({ responses: ['结果A', '结果B'] });
    const results = await requirementChain(fake as unknown as ChatOpenAI).batch([
      { input: '需求A' },
      { input: '需求B' },
    ]);
    expect(results).toEqual(['结果A', '结果B']);
  });
});

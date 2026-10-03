import { ChatOpenAI } from '@langchain/openai';
import { afterEach, describe, expect, it } from 'vitest';
import { createChatModel } from './model.factory.js';

describe('createChatModel', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('缺少 OPENAI_API_KEY 时抛出错误', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createChatModel()).toThrow(/OPENAI_API_KEY/);
  });

  it('按 YAML 参数创建 ChatOpenAI 实例', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const model = createChatModel();
    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model.temperature).toBe(0);
    expect(model.maxTokens).toBe(4000);
  });
});

import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { trimHistory } from './trim-history.js';

function contents(messages: BaseMessage[]): string[] {
  return messages.map((message) => String(message.content));
}

describe('trimHistory', () => {
  it('预算内时原样保留全部消息', async () => {
    const history = [new HumanMessage('你好'), new AIMessage('你好，有什么可以帮你')];
    const trimmed = await trimHistory(history);
    expect(contents(trimmed)).toEqual(contents(history));
  });

  it('超预算时从最旧开始丢弃，保留最近消息', async () => {
    const history = [
      new HumanMessage('长'.repeat(3000)),
      new AIMessage('短回复'),
      new HumanMessage('最近的消息'),
    ];
    const trimmed = await trimHistory(history);
    expect(contents(trimmed)).toEqual(['短回复', '最近的消息']);
  });

  it('支持自定义 maxTokens', async () => {
    const history = [new HumanMessage('x'.repeat(30)), new AIMessage('ok')];
    const trimmed = await trimHistory(history, { maxTokens: 10 });
    expect(contents(trimmed)).toEqual(['ok']);
  });

  it('保留原始顺序', async () => {
    const history = [
      new HumanMessage('第一条'),
      new AIMessage('第二条'),
      new HumanMessage('第三条'),
      new AIMessage('第四条'),
    ];
    const trimmed = await trimHistory(history);
    expect(contents(trimmed)).toEqual([
      '第一条',
      '第二条',
      '第三条',
      '第四条',
    ]);
  });
});

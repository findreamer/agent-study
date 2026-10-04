import type { BaseMessage } from '@langchain/core/messages';

// 模型输出内容统一转字符串：content 为块数组时序列化（保证 JSON 可读）
export function textOf(content: BaseMessage['content']): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

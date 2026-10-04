import { trimMessages } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';

export interface TrimHistoryOptions {
  maxTokens?: number;
  strategy?: 'first' | 'last';
}

export const DEFAULT_TRIM_MAX_TOKENS = 2000;

// 字符近似计数：中文约 1 字 1 token，每条消息另计 4 token 开销。
// trimMessages 在 v1 要求显式提供 tokenCounter，这里用确定性实现保证离线可测。
export function countTokensApprox(messages: BaseMessage[]): number {
  return messages.reduce(
    (sum, message) => sum + String(message.content).length + 4,
    0,
  );
}

// 上下文预算裁剪：默认保留最近 2000 token 的消息（strategy: last）。
export async function trimHistory(
  history: BaseMessage[],
  options: TrimHistoryOptions = {},
): Promise<BaseMessage[]> {
  return trimMessages(history, {
    maxTokens: options.maxTokens ?? DEFAULT_TRIM_MAX_TOKENS,
    strategy: options.strategy ?? 'last',
    tokenCounter: countTokensApprox,
  });
}

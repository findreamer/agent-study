import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableLambda, RunnableWithMessageHistory } from '@langchain/core/runnables';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { getApiKeys } from '../../config/api-keys.js';
import { createChatModel } from '../model.factory.js';
import { trimHistory } from '../messages/trim-history.js';

export const MEMORY_SYSTEM_PROMPT =
  '你是需求分析助手，帮助用户澄清、梳理和评估需求。请结合历史对话上下文作答，不要重复询问已经提供过的信息。';

export interface HistoryEntry {
  role: 'human' | 'ai' | 'system';
  content: string;
}

export interface ChatOptions {
  /** 为 true 时对历史执行 trimHistory 裁剪（默认 2000 token, strategy: last） */
  trim?: boolean;
}

@Injectable()
export class RunnableMemoryService {
  private readonly sessions = new Map<string, InMemoryChatMessageHistory>();

  async chat(sessionId: string, input: string, options: ChatOptions = {}): Promise<string> {
    if (!getApiKeys().openAiApiKey) {
      throw new ServiceUnavailableException(
        'LLM 未就绪：请先在 services/chat/.env 中配置 OPENAI_API_KEY',
      );
    }
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', MEMORY_SYSTEM_PROMPT],
      new MessagesPlaceholder('history'),
      ['human', '{input}'],
    ]);
    const model = createChatModel();

    // 裁剪版本：历史经 trimHistory 截短后再进入提示
    const runnable = options.trim
      ? RunnableLambda.from(async (state: { input: string; history: BaseMessage[] }) => {
          const trimmed = await trimHistory(state.history);
          return prompt.invoke({ input: state.input, history: trimmed });
        }).pipe(model).pipe(new StringOutputParser())
      : prompt.pipe(model).pipe(new StringOutputParser());

    const withHistory = new RunnableWithMessageHistory({
      runnable,
      getMessageHistory: async (id: string) => this.historyFor(id),
      inputMessagesKey: 'input',
      historyMessagesKey: 'history',
    });

    return withHistory.invoke(
      { input },
      { configurable: { sessionId } },
    );
  }

  async getHistory(sessionId: string): Promise<HistoryEntry[]> {
    const history = this.sessions.get(sessionId);
    if (!history) return [];
    const messages = await history.getMessages();
    return messages.map((message) => ({
      role: message.getType() as HistoryEntry['role'],
      content: String(message.content),
    }));
  }

  async appendMessage(
    sessionId: string,
    human: string,
    ai: string,
  ): Promise<void> {
    const history = await this.historyFor(sessionId);
    await history.addMessages([new HumanMessage(human), new AIMessage(ai)]);
  }

  clearSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  private async historyFor(sessionId: string): Promise<InMemoryChatMessageHistory> {
    let history = this.sessions.get(sessionId);
    if (!history) {
      history = new InMemoryChatMessageHistory();
      this.sessions.set(sessionId, history);
    }
    return history;
  }
}

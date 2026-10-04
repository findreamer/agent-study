import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { RunnableWithMessageHistory } from '@langchain/core/runnables';
import { getApiKeys } from '../config/api-keys.js';
import { createChatModel } from '../llm/model.factory.js';
import { MEMORY_SYSTEM_PROMPT } from '../llm/memory/runnable-memory.service.js';
import { DbChatMessageHistory } from '../message/db-chat-history.js';
import { MessageService } from '../message/message.service.js';

/**
 * 会话内对话：历史直接以 messages 表为底座（DbChatMessageHistory），
 * RunnableWithMessageHistory 会把本轮 user 输入与 AI 回复经 addMessage 落库，
 * 天然持久化、重启不丢。
 */
@Injectable()
export class ConversationChatService {
  private readonly prompt = ChatPromptTemplate.fromMessages([
    ['system', MEMORY_SYSTEM_PROMPT],
    new MessagesPlaceholder('history'),
    ['human', '{input}'],
  ]);

  constructor(private readonly messageService: MessageService) {}

  async chat(conversationId: string, input: string): Promise<string> {
    if (!getApiKeys().openAiApiKey) {
      throw new ServiceUnavailableException(
        'LLM 未就绪：请先在 services/chat/.env 中配置 OPENAI_API_KEY',
      );
    }
    const runnable = this.prompt
      .pipe(createChatModel())
      .pipe(new StringOutputParser());
    const withHistory = new RunnableWithMessageHistory({
      runnable,
      getMessageHistory: async () =>
        new DbChatMessageHistory(conversationId, this.messageService),
      inputMessagesKey: 'input',
      historyMessagesKey: 'history',
    });
    return withHistory.invoke({ input }, { configurable: { sessionId: conversationId } });
  }
}

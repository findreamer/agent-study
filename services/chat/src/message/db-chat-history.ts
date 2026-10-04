import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import type { BaseMessage } from '@langchain/core/messages';
import { MessageRole } from '../generated/prisma/client.js';
import type { MessageService } from './message.service.js';

/**
 * DB 版 ChatMessageHistory：以 messages 表为底座，
 * 供 RunnableWithMessageHistory 的 getMessageHistory 回调使用。
 */
export class DbChatMessageHistory extends BaseListChatMessageHistory {
  lc_namespace = ['langchain', 'chat_history', 'db'];

  constructor(
    private readonly conversationId: string,
    private readonly messages: MessageService,
  ) {
    super();
  }

  async addMessage(message: BaseMessage): Promise<void> {
    const type = message.getType();
    const role =
      type === 'human'
        ? MessageRole.USER
        : type === 'ai'
          ? MessageRole.ASSISTANT
          : null;
    if (!role) {
      throw new Error(`不支持的消息类型：${type}（messages 表仅存 USER/ASSISTANT）`);
    }
    await this.messages.addMessage(this.conversationId, role, String(message.content));
  }

  async getMessages(): Promise<BaseMessage[]> {
    return this.messages.getHistoryAsLangChainMessages(this.conversationId);
  }
}

import { describe, expect, it, vi } from 'vitest';
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { BaseListChatMessageHistory } from '@langchain/core/chat_history';
import { MessageRole } from '../generated/prisma/enums.js';
import type { MessageService } from './message.service.js';
import { DbChatMessageHistory } from './db-chat-history.js';

function makeMessageService() {
  return {
    addMessage: vi.fn().mockResolvedValue({ id: 'm1' }),
    getHistoryAsLangChainMessages: vi
      .fn()
      .mockResolvedValue([new HumanMessage('问'), new AIMessage('答')]),
  } as unknown as MessageService;
}

describe('DbChatMessageHistory', () => {
  it('继承 BaseListChatMessageHistory，与 RunnableWithMessageHistory 兼容', () => {
    const history = new DbChatMessageHistory('c1', makeMessageService());
    expect(history).toBeInstanceOf(BaseListChatMessageHistory);
  });

  it('addMessage：HumanMessage 落库为 USER', async () => {
    const messageService = makeMessageService();
    const history = new DbChatMessageHistory('c1', messageService);

    await history.addMessage(new HumanMessage('你好'));

    expect(messageService.addMessage).toHaveBeenCalledWith(
      'c1',
      MessageRole.USER,
      '你好',
    );
  });

  it('addMessage：AIMessage 落库为 ASSISTANT', async () => {
    const messageService = makeMessageService();
    const history = new DbChatMessageHistory('c1', messageService);

    await history.addMessage(new AIMessage('回复'));

    expect(messageService.addMessage).toHaveBeenCalledWith(
      'c1',
      MessageRole.ASSISTANT,
      '回复',
    );
  });

  it('addMessage：不支持的消息类型（如 system）直接拒绝', async () => {
    const messageService = makeMessageService();
    const history = new DbChatMessageHistory('c1', messageService);

    await expect(history.addMessage(new SystemMessage('sys'))).rejects.toThrow(
      '不支持的消息类型',
    );
    expect(messageService.addMessage).not.toHaveBeenCalled();
  });

  it('getMessages：委托 MessageService 转换为 BaseMessage 数组', async () => {
    const messageService = makeMessageService();
    const history = new DbChatMessageHistory('c1', messageService);

    const messages = await history.getMessages();

    expect(messageService.getHistoryAsLangChainMessages).toHaveBeenCalledWith(
      'c1',
    );
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
  });
});

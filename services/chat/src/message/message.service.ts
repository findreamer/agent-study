import { Injectable } from '@nestjs/common';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { Prisma, MessageRole } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PersistedMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata: Prisma.JsonValue | null;
  createdAt: Date;
}

export const DEFAULT_HISTORY_LIMIT = 50;

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  /** 写消息并同步刷新会话 updatedAt（会话列表按最近活跃排序依赖它） */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<PersistedMessage> {
    const [, message] = await this.prisma.$transaction([
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
      this.prisma.message.create({
        data: { conversationId, role, content, metadata },
      }),
    ]);
    return message;
  }

  /** 最近 limit 条，按时间正序返回 */
  async getHistory(
    conversationId: string,
    limit: number = DEFAULT_HISTORY_LIMIT,
  ): Promise<PersistedMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  /** 转换为 LangChain 消息数组，供提示词/链直接消费 */
  async getHistoryAsLangChainMessages(
    conversationId: string,
  ): Promise<BaseMessage[]> {
    const history = await this.getHistory(conversationId);
    return history.map((message) =>
      message.role === MessageRole.USER
        ? new HumanMessage(message.content)
        : new AIMessage(message.content),
    );
  }
}

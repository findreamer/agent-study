import { Injectable, NotFoundException } from '@nestjs/common';
import type { Conversation } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const DEFAULT_CONVERSATION_TITLE = '新会话';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, title?: string): Promise<Conversation> {
    return this.prisma.conversation.create({
      data: {
        userId,
        title: title?.trim() || DEFAULT_CONVERSATION_TITLE,
      },
    });
  }

  findByUser(userId: string) {
    return this.prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  }

  /** 归属校验：会话不存在与非本人会话统一按 404 处理，不泄露存在性 */
  async findById(conversationId: string, userId: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('会话不存在');
    }
    return conversation;
  }

  async delete(conversationId: string, userId: string): Promise<{ ok: true }> {
    await this.findById(conversationId, userId);
    // messages 由 onDelete: Cascade 一并清除
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { ok: true };
  }
}

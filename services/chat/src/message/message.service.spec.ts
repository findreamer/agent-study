import { describe, expect, it, vi } from 'vitest';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { MessageRole } from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { MessageService } from './message.service.js';

function makePrisma() {
  return {
    $transaction: vi.fn(async (ops: unknown[]) => {
      // 模拟 Prisma 顺序事务：返回每个操作的执行结果
      return Promise.all(
        (ops as Array<Promise<unknown>>).map((op) => op),
      );
    }),
    conversation: {
      update: vi.fn().mockResolvedValue({ id: 'c1' }),
    },
    message: {
      create: vi.fn().mockResolvedValue({
        id: 'm1',
        conversationId: 'c1',
        role: 'USER',
        content: 'hi',
      }),
      findMany: vi.fn(),
    },
  } as unknown as PrismaService;
}

function row(id: string, role: 'USER' | 'ASSISTANT', content: string) {
  return {
    id,
    conversationId: 'c1',
    role,
    content,
    metadata: null,
    createdAt: new Date('2026-10-04T00:00:00Z'),
  };
}

describe('MessageService', () => {
  it('addMessage：写消息并同步刷新会话 updatedAt（事务）', async () => {
    const prisma = makePrisma();
    const service = new MessageService(prisma);

    const message = await service.addMessage(
      'c1',
      MessageRole.USER,
      '你好',
      { source: 'test' },
    );

    expect(message).toMatchObject({ id: 'm1', content: 'hi' });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { updatedAt: expect.any(Date) },
    });
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'c1',
        role: MessageRole.USER,
        content: '你好',
        metadata: { source: 'test' },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('getHistory：默认取最近 50 条且按时间正序返回', async () => {
    const prisma = makePrisma();
    // 模拟 desc + take 的查询结果
    vi.mocked(prisma.message.findMany!).mockResolvedValue([
      row('m3', 'ASSISTANT', 'c'),
      row('m2', 'USER', 'b'),
    ]);
    const service = new MessageService(prisma);

    const history = await service.getHistory('c1');

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: { conversationId: 'c1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    expect(history.map((m) => m.id)).toEqual(['m2', 'm3']);
  });

  it('getHistory：limit 参数透传为 take', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.message.findMany!).mockResolvedValue([]);
    const service = new MessageService(prisma);

    await service.getHistory('c1', 5);
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it('getHistoryAsLangChainMessages：USER→HumanMessage、ASSISTANT→AIMessage', async () => {
    const prisma = makePrisma();
    // 模拟 desc + take 的查询结果（最新在前）
    vi.mocked(prisma.message.findMany!).mockResolvedValue([
      row('m2', 'ASSISTANT', '答'),
      row('m1', 'USER', '问'),
    ]);
    const service = new MessageService(prisma);

    const messages = await service.getHistoryAsLangChainMessages('c1');
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBeInstanceOf(HumanMessage);
    expect(messages[1]).toBeInstanceOf(AIMessage);
    expect(messages[0]?.content).toBe('问');
    expect(messages[1]?.content).toBe('答');
  });
});

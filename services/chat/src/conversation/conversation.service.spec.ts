import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { ConversationService } from './conversation.service.js';

function makePrisma() {
  return {
    conversation: {
      create: vi.fn().mockResolvedValue({ id: 'c1', userId: 'u1', title: 'T' }),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({ id: 'c1' }),
    },
  } as unknown as PrismaService;
}

function conv(id: string, userId: string) {
  return {
    id,
    userId,
    title: 'T',
    createdAt: new Date('2026-10-04T00:00:00Z'),
    updatedAt: new Date('2026-10-04T00:00:00Z'),
  };
}

describe('ConversationService', () => {
  it('create：无 title 时默认「新会话」，有 title 时裁剪空白', async () => {
    const prisma = makePrisma();
    const service = new ConversationService(prisma);

    await service.create('u1');
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { userId: 'u1', title: '新会话' },
    });

    await service.create('u1', '  需求分析  ');
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { userId: 'u1', title: '需求分析' },
    });
  });

  it('findByUser：按 updatedAt 倒序并携带消息计数', async () => {
    const prisma = makePrisma();
    const service = new ConversationService(prisma);

    await service.findByUser('u1');
    expect(prisma.conversation.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { messages: true } } },
    });
  });

  it('findById：会话不存在时抛 NotFound', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.conversation.findUnique!).mockResolvedValue(null);
    const service = new ConversationService(prisma);

    await expect(service.findById('missing', 'u1')).rejects.toThrow(
      '会话不存在',
    );
  });

  it('findById：非本人会话同样按 NotFound 处理（不泄露存在性）', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.conversation.findUnique!).mockResolvedValue(conv('c1', 'someone-else'));
    const service = new ConversationService(prisma);

    await expect(service.findById('c1', 'u1')).rejects.toThrow('会话不存在');
  });

  it('findById：本人会话正常返回', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.conversation.findUnique!).mockResolvedValue(conv('c1', 'u1'));
    const service = new ConversationService(prisma);

    const found = await service.findById('c1', 'u1');
    expect(found).toMatchObject({ id: 'c1' });
  });

  it('delete：先做归属校验再删除', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.conversation.findUnique!).mockResolvedValue(conv('c1', 'u1'));
    const service = new ConversationService(prisma);

    const result = await service.delete('c1', 'u1');
    expect(prisma.conversation.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('delete：他人会话不执行删除', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.conversation.findUnique!).mockResolvedValue(conv('c1', 'someone-else'));
    const service = new ConversationService(prisma);

    await expect(service.delete('c1', 'u1')).rejects.toThrow('会话不存在');
    expect(prisma.conversation.delete).not.toHaveBeenCalled();
  });
});

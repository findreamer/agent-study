import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SseService } from './sse.service.js';

function makePrisma() {
  return {
    taskEvent: {
      create: vi
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'e1',
            readAt: null,
            createdAt: new Date('2026-10-06T00:00:00Z'),
            ...data,
          }),
        ),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  } as unknown as PrismaService;
}

function makeRes(overrides: Record<string, unknown> = {}) {
  return {
    write: vi.fn(),
    writableEnded: false,
    destroyed: false,
    ...overrides,
  } as unknown as Response;
}

const EVENT = {
  taskType: 'document_process',
  taskId: 'd1',
  status: 'done' as const,
  message: '完成',
};

describe('SseService', () => {
  it('emit：先落 task_events，再向该用户所有在线连接推送，其他用户不受影响', async () => {
    const prisma = makePrisma();
    const service = new SseService(prisma);
    const resA = makeRes();
    const resB = makeRes();
    const resOther = makeRes();
    service.addConnection('u1', resA);
    service.addConnection('u1', resB);
    service.addConnection('u2', resOther);

    await service.emit('u1', EVENT);

    expect(prisma.taskEvent.create).toHaveBeenCalledWith({
      data: { userId: 'u1', ...EVENT },
    });
    const frame = vi.mocked(resA.write).mock.calls[0]![0] as string;
    expect(frame).toContain('event: task');
    expect(frame).toContain('"taskId":"d1"');
    expect(frame).toContain('"status":"done"');
    expect(resB.write).toHaveBeenCalledOnce();
    expect(resOther.write).not.toHaveBeenCalled();
    expect(service.connectionCount('u1')).toBe(2);
  });

  it('emit：无在线连接时只落库，不报错', async () => {
    const prisma = makePrisma();
    const service = new SseService(prisma);

    await expect(service.emit('u1', EVENT)).resolves.toMatchObject({ taskId: 'd1' });
    expect(prisma.taskEvent.create).toHaveBeenCalledOnce();
  });

  it('removeConnection：最后一条连接移除后 entry 清空', () => {
    const service = new SseService(makePrisma());
    const res = makeRes();
    service.addConnection('u1', res);

    service.removeConnection('u1', res);
    expect(service.connectionCount('u1')).toBe(0);

    // 重复移除不抛错
    service.removeConnection('u1', res);
    expect(service.connectionCount('u1')).toBe(0);
  });

  it('cleanupStaleConnections：清掉已断开连接与空 entry，保留活跃连接', () => {
    const service = new SseService(makePrisma());
    const closed = makeRes({ destroyed: true });
    const ended = makeRes({ writableEnded: true });
    const alive = makeRes();
    service.addConnection('u1', closed);
    service.addConnection('u1', ended);
    service.addConnection('u2', alive);

    service.cleanupStaleConnections();

    expect(service.connectionCount('u1')).toBe(0);
    expect(service.connectionCount('u2')).toBe(1);
  });

  it('purgeOldEvents：按 30 天前的时间线 deleteMany', async () => {
    const prisma = makePrisma();
    const service = new SseService(prisma);

    await service.purgeOldEvents();

    const arg = vi.mocked(prisma.taskEvent.deleteMany!).mock.calls[0]![0];
    const where = (arg?.where ?? {}) as { createdAt?: { lt: Date } };
    const cutoff = where.createdAt!.lt;
    expect(cutoff.getTime()).toBeLessThan(Date.now());
    // 约 30 天前（允许 1 分钟误差）
    expect(Date.now() - cutoff.getTime()).toBeGreaterThan(29.9 * 24 * 60 * 60 * 1000);
  });

  it('unreadEvents：只查该用户 readAt 为空的记录，按时间正序', () => {
    const prisma = makePrisma();
    const service = new SseService(prisma);

    service.unreadEvents('u1');

    expect(prisma.taskEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', readAt: null },
      orderBy: { createdAt: 'asc' },
      take: expect.any(Number),
    });
  });
});

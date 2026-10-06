import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SseController } from './sse.controller.js';
import type { SseService } from './sse.service.js';
import { TaskEventController } from './task-event.controller.js';

function makePrisma() {
  return {
    taskEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockResolvedValue([[], 0]),
  } as unknown as PrismaService;
}

const user = { userId: 'u1', username: 'u1' } as never;

describe('TaskEventController', () => {
  it('history：默认 page=1 pageSize=20，事务内并行取分页与总数', async () => {
    const prisma = makePrisma();
    const controller = new TaskEventController(prisma);

    await controller.history(user);

    const queries = vi.mocked(prisma.$transaction).mock.calls[0]![0] as unknown as unknown[];
    expect(queries).toHaveLength(2);
    expect(prisma.taskEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      }),
    );
  });

  it('history：page=3 pageSize=50 时 skip 正确；非法值 400', async () => {
    const prisma = makePrisma();
    const controller = new TaskEventController(prisma);

    await controller.history(user, '3', '50');
    expect(prisma.taskEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 100, take: 50 }),
    );

    await expect(controller.history(user, '0')).rejects.toThrow('page 必须是正整数');
    await expect(controller.history(user, '1', 'abc')).rejects.toThrow(
      'pageSize 必须是正整数',
    );
    await expect(controller.history(user, '1', '101')).rejects.toThrow(
      'pageSize 不能超过 100',
    );
  });

  it('task：返回该任务的事件时间线；不存在时 404', async () => {
    const prisma = makePrisma();
    vi.mocked(prisma.taskEvent.findMany).mockResolvedValue([]);
    const controller = new TaskEventController(prisma);

    await expect(controller.task(user, 'd1')).rejects.toThrow(NotFoundException);
    expect(prisma.taskEvent.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', taskId: 'd1' },
      orderBy: { createdAt: 'asc' },
    });

    vi.mocked(prisma.taskEvent.findMany).mockResolvedValue([
      { id: 'e1', taskId: 'd1' },
    ] as never);
    await expect(controller.task(user, 'd1')).resolves.toMatchObject({
      taskId: 'd1',
      events: [{ id: 'e1' }],
    });
  });

  it('markRead：更新该任务未读事件；count=0 但任务存在时返回 updated 0', async () => {
    const prisma = makePrisma();
    const controller = new TaskEventController(prisma);

    vi.mocked(prisma.taskEvent.updateMany).mockResolvedValue({ count: 2 });
    await expect(controller.markRead(user, 'd1')).resolves.toEqual({
      taskId: 'd1',
      updated: 2,
    });
    expect(prisma.taskEvent.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', taskId: 'd1', readAt: null },
      data: { readAt: expect.any(Date) },
    });

    vi.mocked(prisma.taskEvent.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(prisma.taskEvent.findFirst).mockResolvedValue({ id: 'e1' } as never);
    await expect(controller.markRead(user, 'd1')).resolves.toEqual({
      taskId: 'd1',
      updated: 0,
    });

    vi.mocked(prisma.taskEvent.findFirst).mockResolvedValue(null);
    await expect(controller.markRead(user, 'd1')).rejects.toThrow(NotFoundException);
  });
});

describe('SseController /api/sse/tasks', () => {
  it('注册连接 + 心跳 + 断开清理', async () => {
    const sse = {
      addConnection: vi.fn(),
      removeConnection: vi.fn(),
      unreadEvents: vi.fn().mockResolvedValue([{ id: 'e1', createdAt: new Date() }]),
      formatEvent: vi.fn().mockReturnValue('event: task\ndata: {}\n\n'),
    } as unknown as SseService;
    const controller = new SseController(sse);

    const req = new EventEmitter() as unknown as Request;
    const writes: string[] = [];
    const res = new EventEmitter() as unknown as Response;
    Object.assign(res, {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        writes.push(chunk);
        return true;
      }),
      writableEnded: false,
    });

    controller.tasks(req, res, user);

    const headers = vi.mocked(res.setHeader as ReturnType<typeof vi.fn>).mock.calls;
    expect(headers[0]).toEqual(['Content-Type', 'text/event-stream; charset=utf-8']);
    expect(writes[0]).toContain('retry: 3000');
    expect(sse.addConnection).toHaveBeenCalledWith('u1', res);

    // 未读事件回放
    await vi.waitFor(() => {
      expect(writes.some((w) => w.startsWith('event: task'))).toBe(true);
    });

    // 断开：移除连接
    req.emit('close');
    expect(sse.removeConnection).toHaveBeenCalledWith('u1', res);
  });
});

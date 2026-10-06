import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import type { Response } from 'express';
import { Prisma, type TaskEvent } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** emit 的事件体：taskId 一般是 documentId，status 复用 TaskStatus 枚举值 */
export interface TaskEventInput {
  taskType: string;
  taskId: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  message?: string;
  metadata?: Prisma.InputJsonValue;
}

const EVENT_TTL_DAYS = 30;
const REPLAY_LIMIT = 100;

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  /** 一个用户可能开多个 Tab，每个 Tab 一条连接 */
  private readonly connections = new Map<string, Set<Response>>();

  constructor(private readonly prisma: PrismaService) {}

  addConnection(userId: string, res: Response): void {
    let set = this.connections.get(userId);
    if (!set) {
      set = new Set();
      this.connections.set(userId, set);
    }
    set.add(res);
  }

  removeConnection(userId: string, res: Response): void {
    const set = this.connections.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) this.connections.delete(userId);
  }

  connectionCount(userId: string): number {
    return this.connections.get(userId)?.size ?? 0;
  }

  /**
   * 事件先落 task_events（断线重连可回放），再推给该用户所有在线连接；
   * 没有在线连接时只落库，不报错。
   */
  async emit(userId: string, event: TaskEventInput): Promise<TaskEvent> {
    const saved = await this.prisma.taskEvent.create({
      data: { userId, ...event },
    });
    this.broadcast(userId, saved);
    return saved;
  }

  /** 断线重连回放：该用户最近的未读事件（readAt 为空） */
  unreadEvents(userId: string): Promise<TaskEvent[]> {
    return this.prisma.taskEvent.findMany({
      where: { userId, readAt: null },
      orderBy: { createdAt: 'asc' },
      take: REPLAY_LIMIT,
    });
  }

  /** SSE 帧格式：event: task + data: JSON。落库记录与实时推送共用同一序列化 */
  formatEvent(event: TaskEvent): string {
    const payload = {
      id: event.id,
      taskType: event.taskType,
      taskId: event.taskId,
      status: event.status,
      message: event.message,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
    };
    return `event: task\ndata: ${JSON.stringify(payload)}\n\n`;
  }

  private broadcast(userId: string, saved: TaskEvent): void {
    const set = this.connections.get(userId);
    if (!set?.size) return;
    const frame = this.formatEvent(saved);
    for (const res of set) {
      if (!res.writableEnded) res.write(frame);
    }
  }

  /** 每分钟清理已断开/写完的僵尸连接，连接全断的 entry 直接移除 */
  @Interval(60_000)
  cleanupStaleConnections(): void {
    for (const [userId, set] of this.connections) {
      for (const res of set) {
        if (res.writableEnded || res.destroyed) set.delete(res);
      }
      if (set.size === 0) this.connections.delete(userId);
    }
  }

  /** 每天凌晨 3 点清理 30 天前的 task_events */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldEvents(): Promise<void> {
    const cutoff = new Date(Date.now() - EVENT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const result = await this.prisma.taskEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log(`已清理 ${result.count} 条 ${EVENT_TTL_DAYS} 天前的任务事件`);
    }
  }
}

import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { SseService } from './sse.service.js';

const HEARTBEAT_INTERVAL_MS = 15_000;

@UseGuards(JwtAuthGuard)
@Controller('api/sse')
export class SseController {
  constructor(private readonly sse: SseService) {}

  /**
   * 任务进度事件流。连接建立后先回放未读事件（断线重连补偿），
   * 再进入实时推送；期间由心跳注释行保活，连接关闭时清理注册。
   */
  @Get('tasks')
  tasks(
    @Req() req: Request,
    @Res() res: Response,
    @CurrentUser() user: AuthUser,
  ): void {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    this.sse.addConnection(user.userId, res);

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(': heartbeat\n\n');
    }, HEARTBEAT_INTERVAL_MS);
    const cleanup = () => {
      clearInterval(heartbeat);
      this.sse.removeConnection(user.userId, res);
    };
    req.on('close', cleanup);
    res.on('close', cleanup);

    void this.replayUnread(user.userId, res);
  }

  private async replayUnread(userId: string, res: Response): Promise<void> {
    try {
      const unread = await this.sse.unreadEvents(userId);
      for (const event of unread) {
        if (!res.writableEnded) res.write(this.sse.formatEvent(event));
      }
    } catch {
      // 回放失败不影响实时推送
    }
  }
}

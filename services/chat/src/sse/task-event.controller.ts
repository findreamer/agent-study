import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/jwt-auth.guard.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@UseGuards(JwtAuthGuard)
@Controller('api/tasks')
export class TaskEventController {
  constructor(private readonly prisma: PrismaService) {}

  /** 分页任务历史，按发生时间倒序 */
  @Get('history')
  async history(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const parsedPage = parsePositiveInt(page, 1, 'page');
    const parsedSize = parsePositiveInt(pageSize, DEFAULT_PAGE_SIZE, 'pageSize');
    if (parsedSize > MAX_PAGE_SIZE) {
      throw new BadRequestException(`pageSize 不能超过 ${MAX_PAGE_SIZE}`);
    }

    const where = { userId: user.userId };
    const [events, total] = await this.prisma.$transaction([
      this.prisma.taskEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parsedPage - 1) * parsedSize,
        take: parsedSize,
      }),
      this.prisma.taskEvent.count({ where }),
    ]);
    return { events, total, page: parsedPage, pageSize: parsedSize };
  }

  /** 单个任务的完整事件时间线 */
  @Get(':taskId')
  async task(@CurrentUser() user: AuthUser, @Param('taskId') taskId: string) {
    const events = await this.prisma.taskEvent.findMany({
      where: { userId: user.userId, taskId },
      orderBy: { createdAt: 'asc' },
    });
    if (events.length === 0) {
      throw new NotFoundException('任务不存在');
    }
    return { taskId, events };
  }

  /** 把该任务的未读事件标记为已读（readAt），供断线回放后确认 */
  @Patch(':taskId/read')
  async markRead(
    @CurrentUser() user: AuthUser,
    @Param('taskId') taskId: string,
  ) {
    const result = await this.prisma.taskEvent.updateMany({
      where: { userId: user.userId, taskId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.taskEvent.findFirst({
        where: { userId: user.userId, taskId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('任务不存在');
    }
    return { taskId, updated: result.count };
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new BadRequestException(`${name} 必须是正整数`);
  }
  return value;
}

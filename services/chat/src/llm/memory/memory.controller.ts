import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { RunnableMemoryService } from './runnable-memory.service.js';

@Controller('api/memory')
export class MemoryController {
  constructor(private readonly memory: RunnableMemoryService) {}

  @Post('chat')
  chat(
    @Body() body: { sessionId: string; input: string; trim?: boolean },
  ) {
    this.readSessionId(body?.sessionId);
    this.readInput(body?.input);
    return this.memory
      .chat(this.readSessionId(body.sessionId), this.readInput(body.input), {
        trim: body.trim === true,
      })
      .then((output) => ({ output }));
  }

  @Get('history/:sessionId')
  history(@Param('sessionId') sessionId: string) {
    return this.memory
      .getHistory(this.readSessionId(sessionId))
      .then((messages) => ({ sessionId, messages }));
  }

  @Delete('history/:sessionId')
  clear(@Param('sessionId') sessionId: string) {
    return { sessionId, cleared: this.memory.clearSession(this.readSessionId(sessionId)) };
  }

  private readSessionId(sessionId: unknown): string {
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      throw new BadRequestException('sessionId 必须是非空字符串');
    }
    return sessionId;
  }

  private readInput(input: unknown): string {
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return input;
  }
}

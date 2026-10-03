import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { LlmService } from './llm.service.js';

export const DEFAULT_INPUT = '用户注册时必须绑定手机号，密码至少8位';

@Controller('api/langchain')
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  @Post('invoke')
  invoke(@Body() body?: { input?: string }) {
    return this.llm.invoke(this.readInput(body)).then((output) => ({ output }));
  }

  @Post('stream')
  async stream(@Res() res: Response, @Body() body?: { input?: string }) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    try {
      for await (const delta of this.llm.stream(this.readInput(body))) {
        if (delta) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({
          error: error instanceof Error ? error.message : 'stream failed',
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  private readInput(body?: { input?: string }): string {
    const input = body?.input ?? DEFAULT_INPUT;
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return input;
  }
}

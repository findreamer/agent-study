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

const MAX_BATCH = 10;

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

  @Post('batch')
  batch(@Body() body?: { inputs?: string[] }) {
    const inputs = body?.inputs ?? [DEFAULT_INPUT];
    if (
      !Array.isArray(inputs) ||
      inputs.length === 0 ||
      inputs.length > MAX_BATCH ||
      inputs.some((input) => typeof input !== 'string' || !input.trim())
    ) {
      throw new BadRequestException(`inputs 必须是 1~${MAX_BATCH} 条非空字符串`);
    }
    return this.llm.batch(inputs).then((outputs) => ({ outputs }));
  }

  private readInput(body?: { input?: string }): string {
    const input = body?.input ?? DEFAULT_INPUT;
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return input;
  }
}

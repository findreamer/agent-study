import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { LlmService } from './llm.service.js';

export const DEFAULT_INPUT = '用户注册时必须绑定手机号，密码至少8位';

@Controller('api/langchain')
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  @Post('invoke')
  invoke(@Body() body?: { input?: string }) {
    return this.llm.invoke(this.readInput(body)).then((output) => ({ output }));
  }

  private readInput(body?: { input?: string }): string {
    const input = body?.input ?? DEFAULT_INPUT;
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return input;
  }
}

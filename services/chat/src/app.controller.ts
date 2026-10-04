import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service.js';
import { RequirementService } from './llm/requirement.service.js';

@Controller('api')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly requirements: RequirementService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  // 验证「共享包 + API 返回 + 前端消费」的最小闭环
  @Get('hello')
  getHello() {
    return this.appService.getHello();
  }

  // 统一业务入口：需求结构化抽取
  @Post('requirement/extract')
  extractRequirement(@Body() body: { input: string }) {
    return this.requirements.extract(body.input);
  }
}

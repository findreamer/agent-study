import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  // 验证「共享包 + API 返回 + 前端消费」的最小闭环
  @Get('hello')
  getHello() {
    return this.appService.getHello();
  }
}

import { Test } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LlmModule } from './llm/llm.module.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app = await Test.createTestingModule({
      imports: [LlmModule],
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('health 应返回 { ok: true }', () => {
    expect(appController.getHealth()).toEqual({ ok: true });
  });

  it('hello 应返回共享包定义的问候', () => {
    expect(appController.getHello()).toBe('Hello World!');
  });
});

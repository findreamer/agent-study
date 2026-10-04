import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

describe('Files routes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/files/chat 缺少 input 返回 400', async () => {
    await request(app.getHttpServer())
      .post('/api/files/chat')
      .send({})
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/files/chat')
      .send({ input: '  ' })
      .expect(400);
  });

  it('POST /api/files/chat 无 key 时返回 503 结构', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const res = await request(app.getHttpServer())
        .post('/api/files/chat')
        .send({ input: '查询需求单 REQ-2026-001' })
        .expect(503);
      expect(res.body.message).toContain('OPENAI_API_KEY');
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });
});

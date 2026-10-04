import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

describe('Memory routes (e2e)', () => {
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

  afterEach(async () => {
    await request(app.getHttpServer()).delete('/api/memory/history/s1');
    await request(app.getHttpServer()).delete('/api/memory/history/s2');
  });

  it('GET/DELETE history 无需模型即可读写', async () => {
    const server = app.getHttpServer();
    const readEmpty = await request(server)
      .get('/api/memory/history/s1')
      .expect(200);
    expect(readEmpty.body.messages).toEqual([]);
    expect(readEmpty.body.sessionId).toBe('s1');
    const removed = await request(server)
      .delete('/api/memory/history/never-exists')
      .expect(200);
    expect(removed.body.cleared).toBe(false);
  });

  it('POST chat 缺少 key 时返回 503，缺少参数返回 400', async () => {
    const server = app.getHttpServer();
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const res = await request(server)
        .post('/api/memory/chat')
        .send({ sessionId: 's1', input: '你好' })
        .expect(503);
      expect(res.body.message).toContain('OPENAI_API_KEY');
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
    await request(server)
      .post('/api/memory/chat')
      .send({ sessionId: '', input: '你好' })
      .expect(400);
    await request(server)
      .post('/api/memory/chat')
      .send({ sessionId: 's1' })
      .expect(400);
  });
});

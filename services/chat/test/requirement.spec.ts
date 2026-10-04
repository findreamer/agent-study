import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

describe('Requirement extract (e2e)', () => {
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

  it('GET /api/health 返回 ok', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200).expect({
      ok: true,
    });
  });

  it('POST /api/requirement/extract 无 key 时返回 503 结构', async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const res = await request(app.getHttpServer())
        .post('/api/requirement/extract')
        .send({ input: '用户注册时必须绑定手机号，密码至少8位' })
        .expect(503);
      expect(res.body.message).toContain('OPENAI_API_KEY');
    } finally {
      if (original !== undefined) process.env.OPENAI_API_KEY = original;
    }
  });
});

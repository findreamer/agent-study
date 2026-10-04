import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';

describe('Embedding routes (e2e)', () => {
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

  it('POST /api/embedding/embed 缺少 text 返回 400', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/embedding/embed').send({}).expect(400);
    await request(server)
      .post('/api/embedding/embed')
      .send({ text: '  ' })
      .expect(400);
  });

  it('POST /api/embedding/store 非法 texts 返回 400', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/embedding/store').send({}).expect(400);
    await request(server)
      .post('/api/embedding/store')
      .send({ texts: [] })
      .expect(400);
    await request(server)
      .post('/api/embedding/store')
      .send({ texts: ['合法', 42] })
      .expect(400);
  });

  it('POST /api/embedding/search 非法参数返回 400', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/embedding/search').send({}).expect(400);
    await request(server)
      .post('/api/embedding/search')
      .send({ query: '合法', k: 0 })
      .expect(400);
    await request(server)
      .post('/api/embedding/search')
      .send({ query: '合法', k: 99 })
      .expect(400);
  });
});

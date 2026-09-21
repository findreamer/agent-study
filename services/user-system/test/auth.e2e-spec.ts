import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure.js';

function decodeJwt(token: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

describe('RBAC end-to-end flow', () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let adminAgent: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    adminAgent = request.agent(server);
  });

  afterAll(async () => {
    await app.close();
  });

  it('1. admin login returns access token, profile and rt cookie', async () => {
    const res = await adminAgent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' })
      .expect(201);

    const cookies = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : [res.headers['set-cookie']];
    expect(cookies.some((c) => c?.startsWith('rt='))).toBe(true);
    const { accessToken, profile } = res.body.data;
    expect(accessToken).toBeTruthy();
    expect(profile.permissions).toContain('user:create');
    expect(profile.menus.map((m: { name: string }) => m.name)).toEqual(['系统管理', '个人中心']);
  });

  it('2. protected route without token is 401', async () => {
    await request(server).get('/api/users').expect(401);
  });

  it('3. admin with token can list users', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' });
    const token = login.body.data.accessToken;

    const res = await request(server)
      .get('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.data.total).toBe(2);
  });

  it('4. tester cannot create systems (403)', async () => {
    const login = await request(server)
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'Test@123456' })
      .expect(201);
    const testerToken = login.body.data.accessToken;
    expect(login.body.data.profile.permissions).not.toContain('system:create');

    await request(server)
      .post('/api/systems')
      .set('Authorization', `Bearer ${testerToken}`)
      .send({ code: 'hack', name: 'hack' })
      .expect(403);
  });

  it('5. permission/data-scope changes take effect on the next request', async () => {
    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' });
    const adminToken = adminLogin.body.data.accessToken;

    const testerLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'Test@123456' });
    const testerToken = testerLogin.body.data.accessToken;
    const testerId = testerLogin.body.data.profile.user.id;
    const deptManagerRole = testerLogin.body.data.profile.systems.length; // sanity
    expect(deptManagerRole).toBe(1);

    // tester starts with DEPT scope: sees only self
    const before = await request(server)
      .get('/api/users')
      .set('Authorization', `Bearer ${testerToken}`);
    expect(before.body.data.total).toBe(1);

    // admin grants tester an additional ALL-scope role
    const role = await request(server)
      .post('/api/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        systemId: testerLogin.body.data.profile.systems[0].id,
        code: 'temp-all',
        name: '临时全量',
        priority: 1,
        dataScope: 'ALL',
        menuIds: [],
      })
      .expect(201);
    const tempRoleId = role.body.data.id;

    const deptManagerId = (
      await request(server)
        .get('/api/roles?systemId=' + testerLogin.body.data.profile.systems[0].id)
        .set('Authorization', `Bearer ${adminToken}`)
    ).body.data.items.find((r: { code: string }) => r.code === 'dept-manager').id;

    await request(server)
      .patch('/api/users/' + testerId)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [deptManagerId, tempRoleId] })
      .expect(200);

    const widened = await request(server)
      .get('/api/users')
      .set('Authorization', `Bearer ${testerToken}`);
    expect(widened.body.data.total).toBe(2);

    // revoke the extra role; immediately back to self
    await request(server)
      .patch('/api/users/' + testerId)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ roleIds: [deptManagerId] })
      .expect(200);
    const narrowed = await request(server)
      .get('/api/users')
      .set('Authorization', `Bearer ${testerToken}`);
    expect(narrowed.body.data.total).toBe(1);
  });

  it('6. switch-system: forbidden for inaccessible system, allowed for admin', async () => {
    const testerLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: 'tester', password: 'Test@123456' });
    await request(server)
      .post('/api/auth/switch-system')
      .set('Authorization', `Bearer ${testerLogin.body.data.accessToken}`)
      .send({ systemCode: 'ghost-system' })
      .expect(403);

    const adminLogin = await request(server)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' });
    const res = await request(server)
      .post('/api/auth/switch-system')
      .set('Authorization', `Bearer ${adminLogin.body.data.accessToken}`)
      .send({ systemCode: 'admin' })
      .expect(201);
    const payload = decodeJwt(res.body.data.accessToken);
    expect(payload.systemId).toBe(adminLogin.body.data.profile.systems[0].id);
  });

  it('7. reusing a rotated refresh token revokes the whole family', async () => {
    // Fresh login on a dedicated agent; capture the first rt from Set-Cookie.
    const agent = request.agent(server);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' })
      .expect(201);
    const oldRt = ((login.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('rt=')) ?? '')
      .split(';')[0];

    // legitimate rotation
    await agent.post('/api/auth/refresh').expect(201);

    // attacker replays the old rt: 401 and the family is flagged
    await request(server)
      .post('/api/auth/refresh')
      .set('Cookie', oldRt)
      .expect(401);

    // the legitimate, newest rt must also be dead now
    await agent.post('/api/auth/refresh').expect(401);
  });

  it('8. after logout refresh no longer works', async () => {
    const agent = request.agent(server);
    const login = await agent
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123456' })
      .expect(201);
    await agent
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.data.accessToken}`)
      .expect(201);
    await agent.post('/api/auth/refresh').expect(401);
  });
});

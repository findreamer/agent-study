import 'dotenv/config';

process.env.NODE_ENV = 'test';
// supertest drives the in-process server over 127.0.0.1; a localhost-scoped
// cookie would not be replayed by the agent jar.
delete process.env.COOKIE_DOMAIN;

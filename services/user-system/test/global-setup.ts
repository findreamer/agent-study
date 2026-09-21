import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@agent-study/database/prisma';

const serviceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbDir = path.resolve(serviceDir, '../../packages/database');

const ADMIN_URL = 'postgresql://agent:agent@localhost:5432/postgres';
const TEST_DB = 'agent_study_test';
const TEST_URL = `postgresql://agent:agent@localhost:5432/${TEST_DB}`;

export default async function setup() {
  // Recreate the test database from scratch on every run so data left behind
  // by previous tests (e.g. temporary roles) cannot conflict.
  const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.$executeRawUnsafe(`CREATE DATABASE ${TEST_DB}`);
  await admin.$disconnect();

  const prismaBin = path.join(dbDir, 'node_modules/.bin/prisma');
  execFileSync(prismaBin, ['migrate', 'deploy', '--schema=prisma/schema.prisma'], {
    cwd: dbDir,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: 'inherit',
  });
  execFileSync('bun', ['run', 'prisma/seed.ts'], {
    cwd: dbDir,
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: 'inherit',
  });

  process.env.DATABASE_URL = TEST_URL;
  process.env.NODE_ENV = 'test';
}

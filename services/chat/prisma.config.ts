import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7 起不再从 schema.prisma 读取 url，统一在配置文件里声明数据源；
// CLI（migrate/generate）与运行时（adapter-pg）都以 DATABASE_URL 为准。
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',
  },
});

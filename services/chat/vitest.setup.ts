// 所有测试共享的 setup：加载 .env（与 main.ts 的 dotenv/config 行为一致），
// 让依赖 DATABASE_URL 等环境变量的服务（如 PrismaService）能在测试中构造。
import 'dotenv/config';

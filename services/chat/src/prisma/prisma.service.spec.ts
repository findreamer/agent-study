import 'dotenv/config';
import { beforeAll, describe, expect, it, afterAll } from 'vitest';
import { MessageRole } from '../generated/prisma/enums.js';
import { PrismaService } from './prisma.service.js';

// 集成测试：依赖本地 PostgreSQL（bun run db:up 后可用），未配置 DATABASE_URL 时跳过
describe.skipIf(!process.env.DATABASE_URL)('PrismaService', () => {
  let prisma: PrismaService;
  const testUserId = `it-${Date.now()}`;

  beforeAll(() => {
    prisma = new PrismaService();
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.conversation.deleteMany({ where: { userId: testUserId } });
    await prisma.taskEvent.deleteMany({ where: { userId: testUserId } });
    await prisma.$disconnect();
  });

  it('能连接数据库并完成一轮写入/查询/删除', async () => {
    await prisma.$connect();

    const conversation = await prisma.conversation.create({
      data: { userId: testUserId, title: '连通性测试会话' },
    });
    expect(conversation.id).toBeTruthy();

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.USER,
        content: '你好',
      },
    });
    expect(message.role).toBe(MessageRole.USER);

    const found = await prisma.conversation.findUnique({
      where: { id: conversation.id },
      include: { messages: true },
    });
    expect(found?.messages).toHaveLength(1);

    // 级联删除验证：删除会话后消息应一并消失
    await prisma.conversation.delete({ where: { id: conversation.id } });
    expect(await prisma.message.count({ where: { id: message.id } })).toBe(0);
  });

  it('task_events 能写入枚举状态并按 userId 查询', async () => {
    await prisma.taskEvent.create({
      data: {
        userId: testUserId,
        taskType: 'vectorize',
        taskId: 'it-task-1',
        status: 'processing',
        message: '阶段 1 连通性测试',
      },
    });
    const events = await prisma.taskEvent.findMany({
      where: { userId: testUserId },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('processing');
  });
});

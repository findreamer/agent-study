# chat 服务生产化改造（DB + 向量持久化）实施计划

> 承接第四章能力基础，完成从 demo 到生产形态的关键改造：数据库建模、会话持久化、文档上传、向量化落库、任务通知，以及端到端分析链路串联。
>
> **前提认知**：Memory / Tools / Embeddings / Multi-Agent 的能力验证已完成，但数据保存在进程内存或本地文件——`InMemoryChatMessageHistory` 重启即失、`MemoryVectorStore` 随进程退出清空、`workspace/requirements/*.json` 是手写 mock，且没有用户身份与数据隔离。

**Goal:** 会话、文件、向量和任务状态迁移到可持久、可管理、可隔离的存储体系
**Architecture:** NestJS 12 (services/chat) + Prisma 7 (driver adapter-pg) + PostgreSQL 17 + pgvector
**Tech Stack:** prisma@7 / @prisma/client@7 / @prisma/adapter-pg@7 / pg@8；pgvector/pgvector:pg17 镜像
**Branch:** `feat/db-vector`（自 `feat/chat-langchain` 切出）

## 已确认的决策

| 决策点 | 结论 |
| --- | --- |
| 鉴权 | chat 与 user-system 共享 `JWT_SECRET`，chat 用 @nestjs/jwt 本地验签取 `sub` 作 userId（user-system 签发：HS256，payload 含 sub/username/isSuperadmin/systemId，登录路由 `POST /auth/login`，AT 默认 1d） |
| 向量存储 | pgvector 扩展（PostgreSQL 内），替换 MemoryVectorStore |
| 任务通知 | SSE 实时推送 + task_events 持久化（复用 `llm.controller` 手写 SSE 模式） |
| 端到端演示载体 | 更新 chat-web 页面（登录 / 会话 / 上传 / 分析） |
| 数据库 | chat 域独立库 `agent_study_chat`：与 user-system 共库会让两套 prisma migrate 目录共用同一张 `_prisma_migrations` 状态表而互相报 drift |

## 全局约束

- Prisma 7：schema 不再写 url，统一 `prisma.config.ts` 的 `datasource.url = process.env["DATABASE_URL"]`；CLI 不自动加载 .env，config 顶部需 `import 'dotenv/config'`
- `Unsupported("vector")` 列 Prisma client 只读：**写入与相似度检索必须走 `$executeRaw` / `$queryRaw`**（参数经 `::vector` 转换）
- 不建 User 表，userId 裸 String + 索引
- 既有 demo 路由（api/langchain、api/memory 等）保持可用；新生产路由按用户隔离

---

## 阶段 1：数据库设计与初始化

### 实现 Prompt（原文）

> 基于当前分支新建一个 feat/db-vector，在 services/chat 中完成数据库设计与初始化，严格按以下要求执行：
>
> 前置：
> - 安装依赖：prisma @prisma/client @prisma/adapter-pg pg（Prisma 7）
> - 在 prisma.config.ts 中配置 datasource.url = process.env["DATABASE_URL"]（Prisma 7 不再在 schema 内写 url）
>
> 1. Prisma Schema 设计（prisma/schema.prisma）：
>    - 启用 pgvector：generator 加 previewFeatures = ["postgresqlExtensions"]，datasource 加 extensions = [vector]
>    - 不建 User 表：用户系统由 user-system 微服务维护，userId 用裸 String 关联
>    - conversations：id, userId, title, createdAt, updatedAt
>    - messages：id, conversationId(关联 conversations, onDelete: Cascade), role(MessageRole), content, metadata(Json?), createdAt
>    - documents：id, userId, filename, mimeType, size, filePath?, storageType(默认 local), status(默认 pending), chunkCount(默认 0), createdAt
>    - document_chunks：id, documentId(关联 documents, onDelete: Cascade), content, chunkIndex, embedding(Unsupported("vector"))
>    - task_events：id, userId, taskType, taskId, status(TaskStatus), message?, metadata?, createdAt, readAt?
>    - 枚举：MessageRole { USER, ASSISTANT }、TaskStatus { pending, processing, done, error }
>
> 2. Prisma Service：
>    - 新建 services/chat/src/prisma/prisma.service.ts（用 @prisma/adapter-pg）
>    - 新建 services/chat/src/prisma/prisma.module.ts（Global module）
>
> 3. 迁移与验证：
>    - 执行 bun run db:migrate
>    - 执行 bun run db:generate

### 关键设计与核心片段

**prisma.config.ts**（Prisma 7 配置式数据源）：

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env['DATABASE_URL'] ?? '' },
});
```

**generator**：`prisma-client`（Prisma 7 新生成器，输出 TS 源码到 `src/generated/prisma`，ESM 直接 import，无需 postinstall 拷贝）；`pgvector` 经 `extensions = [vector]` 让 migrate 自动生成 `CREATE EXTENSION`。

**PrismaService（adapter-pg）**：

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env['DATABASE_URL'];
    if (!connectionString) throw new Error('DATABASE_URL 未配置');
    super({ adapter: new PrismaPg({ connectionString }) });
  }
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

**基础设施调整（计划内偏差）**：`postgres:17-alpine` 不含 pgvector，compose（yaml + dev.yaml）镜像换为 `pgvector/pgvector:pg17`——基于同一 postgres 17 主版本，`postgres-data` 卷直接复用，`db:up` 重建容器即可。

**测试基建**：新增 `vitest.setup.ts`（`import 'dotenv/config'`）并挂到 `vitest.config.ts` 的 `setupFiles`——e2e 用 Test.createTestingModule 启动完整 AppModule 时 PrismaService 需要 DATABASE_URL，与 main.ts 行为保持一致。

### 验证记录（2026-10-04）

- 迁移：`20261004131228_init` 落库成功
- psql 核验：五表（conversations/messages/documents/document_chunks/task_events）+ `_prisma_migrations` 就位；`vector` 扩展 0.8.7；`document_chunks.embedding` 为 nullable `vector` 列；两枚举标签与任务书一致；`conversations_userId_idx`、`task_events_userId_createdAt_idx`、`task_events_taskId_idx` 索引齐备
- 集成测试 `prisma.service.spec.ts` 2/2：会话/消息写入 + 级联删除 + task_events 枚举读写
- 全量 85/85 通过；typecheck 通过；服务启动 PrismaModule 连接正常
- `.gitignore` 新增 `/src/generated/`（生成物不入库）

---

## 阶段 2：会话持久化 + 用户鉴权（已完成 2026-10-04）

### 实现 Prompt（原文）

> 在 services/chat 的 LangChain 层中，用 PostgreSQL 替换 InMemoryChatMessageHistory，严格按以下要求执行：
>
> 1. 会话服务（services/chat/src/conversation/conversation.service.ts）：
>    - create(userId, title?) / findByUser(userId) / findById(conversationId, userId)（含权限校验）/ delete(conversationId, userId)
> 2. 消息服务（services/chat/src/message/message.service.ts）：
>    - addMessage(conversationId, role, content, metadata?)
>    - getHistory(conversationId, limit?)
>    - getHistoryAsLangChainMessages(conversationId)：转换为 LangChain BaseMessage 数组
> 3. 自定义 ChatMessageHistory（services/chat/src/message/db-chat-history.ts）：
>    - 继承 BaseListChatMessageHistory，内部调用 MessageService 读写 messages 表
>    - 与 RunnableWithMessageHistory 兼容
> 4. 新增路由（@Controller('api/conversations')，全部经 JwtAuthGuard）：
>    - POST /：创建会话；GET /：当前用户会话列表；GET /:id/messages：会话消息历史；POST /:id/chat：在指定会话中发送消息；DELETE /:id：删除会话

### 关键设计与核心片段

**DB 版 ChatMessageHistory**（与 `RunnableWithMessageHistory` 对接的关键只有两点：继承 `BaseListChatMessageHistory`、实现 `getMessages/addMessage`）：

```ts
export class DbChatMessageHistory extends BaseListChatMessageHistory {
  lc_namespace = ['langchain', 'chat_history', 'db'];
  constructor(private readonly conversationId: string, private readonly messages: MessageService) { super(); }

  async addMessage(message: BaseMessage): Promise<void> {
    const role = message.getType() === 'human' ? MessageRole.USER
               : message.getType() === 'ai' ? MessageRole.ASSISTANT : null;
    if (!role) throw new Error(`不支持的消息类型：${message.getType()}`);
    await this.messages.addMessage(this.conversationId, role, String(message.content));
  }
  async getMessages(): Promise<BaseMessage[]> {
    return this.messages.getHistoryAsLangChainMessages(this.conversationId);
  }
}
```

**自动落库**：`RunnableWithMessageHistory` 会把 `inputMessagesKey` 对应的输入写为 HumanMessage、最终输出写为 AIMessage——服务代码里没有任何手写"保存消息"，持久化是历史机制自带的副作用。

**会话内对话流**（`ConversationChatService`）：`prompt(system=MEMORY_SYSTEM_PROMPT + history placeholder).pipe(createChatModel()).pipe(StringOutputParser)`，`getMessageHistory: async () => new DbChatMessageHistory(conversationId, messageService)`。

**鉴权**（提前自阶段 5）：`JwtAuthGuard` 对 user-system 签发的 access token 本地验签（HS256 + 共享 JWT_SECRET，取 `payload.sub` 作 userId 挂 `req.user`），不调用 user-system、不签发 token；`@UseGuards(JwtAuthGuard)` 类引用的守卫在**消费模块**里实例化，故 `JwtModule.register({ global: true })`。

**Nest DI 陷阱实录**：服务里 `import type { PrismaService }` 会让 `emitDecoratorMetadata` 在运行时拿不到类型，DI 报 "argument at index [0] is available"——被装饰器注入的类必须值导入。

**归属校验**：findById 校验 `conversation.userId !== userId` 时抛 404（不是 403），避免泄露会话存在性。

### 验证记录（2026-10-04，真实链路）

- user-system 登录（`POST /api/auth/login`，种子 admin）→ access token（277 字符）
- `POST /api/conversations`（无 token → 401；带 token → 创建成功）
- 第一轮 chat 真实 LLM → messages 表 2 条；**重启服务后 GET messages 仍 2 条**（持久化核心验收）
- 第二轮 chat 回复明确引用第一轮给出的「产品方向 A/B/C」→ DB 历史确实进入提示词
- 会话列表含 `_count.messages`；`DELETE` 后再查历史 404（级联删除）
- 单测 106/106（新增 21：三服务 16 + 守卫 5），typecheck 通过

## 阶段 3：文档上传与向量化 Pipeline（待开始）

> 计划：multer 内存存储上传（PDF/TXT/MD/DOCX；pdf-parse / mammoth 解析）→ RecursiveCharacterTextSplitter 分块 → XenovaEmbeddings 向量化 → document_chunks `$executeRaw` 写入；documents.status 状态机 pending→processing→done/error；任务进度事件写 task_events。

## 阶段 4：pgvector 检索 + SSE 任务通知（待开始）

> 计划：`$queryRaw` 余弦相似度检索（`embedding <=> $query::vector`，join documents 按 userId 隔离）；SSE 推送任务进度（复用手写 SSE），事件先落 task_events 再广播，断线重连可回放未读事件（readAt）。

## 阶段 5：统一调用链路（待开始）

> 计划：Global JwtAuthGuard（@Public() 豁免 demo 路由与健康检查）→ 创建会话 → 上传需求文档 → 分析（检索 topK 上下文 + 会话历史喂给编排器）→ 报告以 ASSISTANT 消息持久化并写 task_events。

## 阶段 6：chat-web 页面 + 端到端验证（待开始）

> 计划：登录页（调 user-system /auth/login）、会话列表与消息、文档上传与 SSE 进度条、分析报告展示；curl 脚本 + 页面双链路验证。

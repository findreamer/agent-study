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

## 阶段 3：文档上传与向量化 Pipeline（已完成 2026-10-05）

### 实现 Prompt（原文）

> 在 services/chat 中实现文件上传功能，严格按以下要求执行：
>
> 1. 安装依赖：@nestjs/platform-express、multer、@types/multer
>
> 2. 文件上传服务（services/chat/src/document/document.service.ts）：
>    - upload(userId, file, filename)：保存到 uploads/{userId}/{timestamp}-{name}，元数据写入 documents 表（status: pending）
>    - findByUser(userId) / findById(documentId, userId)（权限校验）/ delete(documentId, userId)（含物理文件）
>    - 允许类型：text/plain, text/markdown, text/x-markdown, application/pdf, docx/msword
>    - 文件大小限制：10MB
>
> 3. 新增路由（@Controller('api/documents')，经 JwtAuthGuard）：
>    - POST /upload（multipart/form-data，内存存储 + fileFilter）
>    - POST /:id/process：触发解析+分块+向量化（异步，返回 202）
>    - GET / ：文档列表；GET /:id：详情；DELETE /:id

### 关键设计与核心片段

**模块划分**：`document.service.ts` 只做 CRUD（任务书范围），管道独立为 `document-process.service.ts`；`DocumentModule` 复用 `AuthModule`（守卫）与 `LlmModule` 的 `XenovaEmbeddings` 单例（不重复注册，否则模型加载一次变两次）。

**filePath 存相对路径**：落库存 `path.join(userId, storedName)`（相对 `uploadsRoot()`），读取/删除时再 `path.resolve(uploadsRoot(), filePath)`——对 cwd 漂移与容器部署都稳定，也不会在 tmp 目录测试时产生 `../..` 泄漏。文件名用 `path.basename` 拦截路径穿越。

**fileFilter 双重白名单**：MIME 清单放行 txt/md/pdf/msword/docx（docx 实际 MIME 是 `application/vnd...wordprocessingml.document`）；对 `application/octet-stream` 按扩展名兜底（部分客户端不按规范发 MIME）。`limits.fileSize = 10MB` 由 multer 在内存存储层拦截。

**异步管道**（`POST /:id/process` 返回 202）：

```ts
void this.processService.process(id, user.userId).catch((error) => this.logger.error(...));
return { documentId: id, status: 'processing' };
```

成败都不走 HTTP——状态机推到 `documents.status`（pending→processing→done/error），进度写 `task_events`（taskType=document_process, taskId=文档 id），为阶段 4 的 SSE 广播备好事件源。

**向量落库**（Prisma 对 `Unsupported("vector")` 只读，必须 `$executeRaw`）：

```ts
const literal = vector ? `[${vector.join(',')}]` : null;
await this.prisma.$executeRaw`
  INSERT INTO document_chunks (id, "documentId", content, "chunkIndex", embedding, "createdAt")
  VALUES (${randomUUID()}, ${documentId}, ${content}, ${chunkIndex}, ${literal}::vector, now())
`;
```

列名是 Prisma 字段原样（camelCase，SQL 需引号）；向量以 `'[...]'` 字符串参数化传入再 `::vector` 转换，避免注入。id 在 JS 侧 `randomUUID()`（raw INSERT 吃不到 `@default(cuid())`）。

**解析路由**：`text/*` 直接 utf8；`application/pdf` 用 pdf-parse v2（`new PDFParse({ data }).getText()`，用完 `destroy()`）；docx 用 mammoth `extractRawText`（仅支持 .docx，旧版二进制 .doc 会抛错走 error 事件——上传允许、处理报错，行为如实）。分块 `RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 100 })`，嵌入按 16 条/批调用 `embedDocuments`。重复 process 先 `deleteMany` 旧分块。

### 验证记录（2026-10-05，真实链路）

- 无 token 上传 → 401；`.sh` 文件 → 400 fileFilter 拒绝；md/txt/pdf → 201，文件落在 `uploads/{userId}/{timestamp}-{name}`
- `POST /:id/process` → 202；轮询详情 pending→processing→done
- 修复一次真实 bug：process 侧按 cwd 解析 filePath 导致 ENOENT——错误路径正好验证了兜底（status=error + task_events 写入「处理失败：ENOENT...」）
- psql 验收：long.txt（40 行中文）分 4 块、sample.pdf 解析 1 块，全部 384 维向量（`vector_dims`）；task_events 顺序 processing→error→processing→done
- DELETE → 记录删除、document_chunks 级联清零、物理文件移除；再查详情 404
- 单测 116/116（新增 10：service 7 + process 3，FakeEmbeddings 注入测管道），typecheck 通过

## 阶段 4：pgvector 检索 + SSE 任务通知（检索已完成 2026-10-05，SSE 待开始）

### 实现 Prompt（原文 · pgvector 检索部分）

> 接下来我们进一步细化，并用 pgvector 替换第四章中的 MemoryVectorStore，使向量数据能够持久化保存和检索。
>
> 在 services/chat 中实现向量化落库，严格按以下要求执行：
>
> 1. 向量化服务（services/chat/src/document/embedding.service.ts）：
>    - 复用第四章 @xenova/transformers（Xenova/paraphrase-multilingual-MiniLM-L12-v2）
>    - embedTexts(texts)：mean pooling + L2 单位化，返回 384 维向量
>
> 2. 完整 Pipeline（chunk.service.ts 的 processDocument）：
>    - 解析 → 分块 → embedTexts → 用 raw SQL 写入 document_chunks.embedding（vector）
>    - 更新 documents.status 与 chunkCount
>
> 3. 语义检索（services/chat/src/document/search.service.ts）：
>    - similaritySearch(query, userId, topK)：query 向量化 → pgvector <=> 余弦距离
>    - JOIN documents 过滤 userId（用户隔离）→ 返回 topK（content + score）
>
> 4. 新增路由：POST /api/search（@Controller('api/search')，经 JwtAuthGuard）

### 关键设计与核心片段

**MemoryVectorStore 的替代关系**：第四章 demo 路由（`api/embedding`）保留 MemoryVectorStore 不动；生产链路的上传→向量化→检索全部改走 pgvector——向量随 document_chunks 持久化，重启可检索、可按用户隔离。

**DocumentEmbeddingService**（document 域的 embedTexts 入口）：委托注入的第四章 `XenovaEmbeddings` 单例（`embedDocuments` 内部即 mean pooling + `normalize: true` = L2 单位化，输出 384 维），不新建模型实例，避免二次加载。

**管道归位 ChunkService.processDocument**：上一阶段的 document-process.service 按任务书重构为 chunk.service.ts，逻辑不变（202 异步、task_events、状态机、`$executeRaw` + `::vector` 参数化写入）。

**语义检索核心 SQL**（`$queryRaw`，vector 列 Prisma 只读）：

```sql
SELECT c.content,
       1 - (c.embedding <=> ${literal}::vector) AS score
FROM document_chunks c
JOIN documents d ON d.id = c."documentId"
WHERE d."userId" = ${userId}
ORDER BY c.embedding <=> ${literal}::vector
LIMIT ${topK}
```

`<=>` 是余弦距离（0~2），score = 1 - 距离转回相似度语义；userId 过滤放在 JOIN 的 documents 上，一次查询同时完成隔离与检索。

**路由**：`POST /api/search`，body `{ query, topK? }`（topK 默认 5，1~20 校验），返回 `{ query, topK, results: [{ content, score }] }`。

### 验证记录（2026-10-05，真实链路）

- requirement-spec.md process → done（1 块落库，`vector_dims` = 384）
- 检索「会话历史在服务重启后会不会丢失」「分析任务由哪些智能体协作完成」→ 命中需求文档片段，score 0.19~0.47；无关查询「今天中午吃什么」score 显著回落（0.07~0.18）——语义区分度成立
- topK=99 → 400；无 token → 401
- 期间一次真实故障：重构中间态被 bun --watch 热重启撞上（controller 引用旧类名）导致进程退出，代码一致后重启即恢复
- 单测 119/119（新增 3 个检索测试 + 管道测试迁移适配），typecheck 通过

## 阶段 5：统一调用链路（待开始）

> 计划：Global JwtAuthGuard（@Public() 豁免 demo 路由与健康检查）→ 创建会话 → 上传需求文档 → 分析（检索 topK 上下文 + 会话历史喂给编排器）→ 报告以 ASSISTANT 消息持久化并写 task_events。

## 阶段 6：chat-web 页面 + 端到端验证（待开始）

> 计划：登录页（调 user-system /auth/login）、会话列表与消息、文档上传与 SSE 进度条、分析报告展示；curl 脚本 + 页面双链路验证。

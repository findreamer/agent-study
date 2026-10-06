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

## 阶段 4：pgvector 检索 + SSE 任务通知（已完成 2026-10-06）

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

### 实现 Prompt（原文 · SSE 任务通知部分）

> 在 services/chat 中实现 SSE 任务推送机制，严格按以下要求执行：
>
> 1. SseService（services/chat/src/sse/sse.service.ts）：
>    - 维护 Map<userId, Set<Response>>（一个用户多 Tab 共用）
>    - addConnection(userId, res) / removeConnection(userId, res)
>    - emit(userId, event)：先持久化到 task_events 表，再实时推送给在线连接
>    - 用 @nestjs/schedule 定期清理离线 entry 与 30 天前的 task_events
>
> 2. SseController（@Controller('api/sse')，经 JwtAuthGuard）：
>    - GET /tasks：text/event-stream，注册连接 + 心跳，断开时清理
>
> 3. TaskEventController（@Controller('api/tasks')）：
>    - GET /history：分页查询任务历史；GET /:taskId；PATCH /:taskId/read
>
> 4. ChunkService.processDocument 在开始/完成/失败时 emit 对应状态事件

### 关键设计与核心片段（SSE）

**事件出口收敛到 SseService**：chunk.service 原来只落库的 `emitEvent`（taskEvent.create）上移为 `sse.emit(userId, event)`——**先 `task_events.create`，再 `broadcast` 给该用户所有在线连接**。无在线连接时只落库不报错；`task_events` 由此成为唯一事件源，实时推送只是它的缓存视图。

**断线回放 + 已读确认**（readAt）：

- `GET /api/sse/tasks` 连接建立后先查 `unreadEvents`（`readAt: null`，按 createdAt 正序，上限 100）回放，再交由实时推送——断线期间 emit 落库的事件重连即补发；客户端按事件 `id` 去重
- `PATCH /api/tasks/:taskId/read` 把该任务的未读事件批量置 `readAt`，确认后不再回放
- SSE 帧统一 `event: task` + `data: JSON`（含 id/taskType/taskId/status/message/metadata/createdAt），落库与推送共用同一 `formatEvent`

**连接生命周期**（复用 llm.controller 手写 SSE 模式）：`Map<userId, Set<Response>>` 支持多 Tab；`@Res()` 手写响应头 + `flushHeaders`，`req.on('close')`/`res.on('close')` 双保险清理注册；15s 心跳注释行（`: heartbeat`）保活。

**@nestjs/schedule 定时任务**：`ScheduleModule.forRoot()` 注册进 AppModule；`@Interval(60s)` 清理 `writableEnded/destroyed` 的僵尸连接与空 entry；`@Cron(EVERY_DAY_AT_3AM)` 删除 30 天前的 task_events。

**TaskEventController**（`api/tasks`，同样经 JwtAuthGuard——任务书未写但隔离必须）：`GET /history` 事务并行取分页 + total（page/pageSize 校验，pageSize ≤ 100）；`GET /:taskId` 返回该任务完整事件时间线；`PATCH /:taskId/read` 返回 `{ taskId, updated }`，count=0 时区分「已全部已读」与「任务不存在（404）」。

### 验证记录（2026-10-06，真实链路）

- SSE 流验证：连接建立后回放全部未读历史事件（含 10-05 的 processing→error→done 序列）；触发 requirement-spec.md 重处理，`processing`（03:19:24）→ `done`（03:19:25，metadata.chunkCount=1）实时推达
- `GET /api/tasks/history?page=1&pageSize=3` 分页正确；`GET /api/tasks/:taskId` 返回 4 条时间线；`PATCH /:taskId/read` → `{updated: 4}`，重复读 → `{updated: 0}`
- 已读后重连：该 taskId 事件不再回放；17s 连接内收到 1 条心跳；无 token → 401（SSE 与 tasks 均是）
- 单测 130/130（新增 sse.service 6 例、task-event/sse controller 5 例，chunk 测试改为断言 `sse.emit`），typecheck 通过
- 期间机器重启导致 Docker 守护进程丢失：重新拉起 Docker Desktop + postgres 容器后恢复

## 阶段 5：统一调用链路（统一分析服务已完成 2026-10-06；Global JwtAuthGuard 收编 demo 路由待做）

### 实现 Prompt（原文）

> 把前面所有能力整合为统一的分析入口，严格按以下要求执行：
>
> 1. 统一分析服务（services/chat/src/llm/advanced-analysis.service.ts）：
>    - analyze(userId, conversationId, input)：
>      1. DbChatHistory 读取会话历史
>      2. SearchService 语义检索当前用户文档（topK=3）
>      3. 拼接历史 + 检索上下文 + 当前输入
>      4. OrchestratorService.orchestrate(input, retrievedContext) 执行多 Agent 分析
>      5. 把用户输入与分析结论写入 messages 表
>      6. 返回 report、usedAgents、retrievedDocuments
>
> 2. POST /api/conversations/:id/chat 接入该服务（非流式 JSON，第六章再升级流式 UI）

### 关键设计与核心片段

**数据流**：`analyze(userId, conversationId, input)` 并行取 `DbChatMessageHistory.getMessages()`（messages 表底座）与 `search.similaritySearch(input, userId, 3)`（pgvector），拼成 `retrievedContext`——`【会话历史】transcript` + `【文档检索上下文】[i]（相关度 x.xx）content` 两块（各自可缺省、条目截断 400 字符）——交给 `orchestrate(input, retrievedContext)`；编排器把上下文拼进 `effectiveInput`，五个 Agent 看到同一份背景。

**结论落库**：用户输入恒写 `USER` 消息；`completed` → 报告写 `ASSISTANT`，`needs_clarification` → 澄清问题写 `ASSISTANT`（保住下轮对话连贯性），`failed` → 不写助手消息；报告仍落盘 workspace `reports/`（第四章报告落盘能力保留）。

**orchestrate 签名升级**：`orchestrate(input, retrievedContext?)`，空白上下文按原输入处理——第四章 demo 用法（单参）不变。

**模块接线**（拆掉了两处障碍）：
- `MessageModule`（新）：MessageService 从 ConversationModule 拆出，Conversation 与 Advanced 两模块共用，避免 `ConversationModule ↔ AdvancedModule` 循环依赖
- `DocumentModule` 导出 `SearchService`；`AdvancedModule` imports `[LlmModule, DocumentModule, MessageModule]`
- **Nest DI 陷阱**：advanced-analysis.service 里 SearchService/MessageService 必须值导入——`import type` 会抹掉 `design:paramtypes` 元数据，e2e 起不来（`Nest can't resolve dependencies ... at index [1]`）
- 删除 `ConversationChatService`（简单对话链路被统一入口取代）

**路由**：`POST /api/conversations/:id/chat` 与 `POST /api/advanced/analyze`（第四章演示路由，改为 JWT + `{conversationId, input}` 契约）都委托同一个 `AdvancedAnalysisService.analyze`，非流式 JSON。

### 验证记录（2026-10-06，真实链路）

- 建会话 → `POST /api/conversations/:id/chat` 触发统一分析：5 Agent 全部执行（extract 7s / clarify 15s / risk 74s / analysis 74s / summary 67s，思考型模型偏慢），status=completed，报告落盘 + ASSISTANT 消息落库（`GET /:id/messages` 可见 USER+ASSISTANT 两条）
- 客户端 curl 180s 超时而服务端继续执行成功的教训：同步分析耗时超过 3 分钟，第六章流式 UI（SSE）是刚需
- 单测 132/132（analysis 重写 6 例：上下文拼接/空上下文/落库三分支/截断；orchestrator 新增上下文传达与空白上下文 2 例；advanced.controller 新契约），typecheck 通过

## 阶段 6：chat-web 页面 + 端到端验证（待开始）

> 计划：登录页（调 user-system /auth/login）、会话列表与消息、文档上传与 SSE 进度条、分析报告展示；curl 脚本 + 页面双链路验证。

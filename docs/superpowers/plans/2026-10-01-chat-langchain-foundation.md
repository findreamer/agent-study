# chat 服务 LangChain 接入基础 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `services/chat` 完成 LangChain 接入准备与模型调用基础：YAML+env 两层配置、统一模型工厂、`POST /api/langchain/invoke|stream|batch` 三种调用路由。

**Architecture:** 配置拆两层——敏感信息（令牌/服务地址）走 `process.env`（`services/chat/.env`），运行调优参数走 `config/langchain.yaml`（js-yaml 加载 + 启动期校验）。`createChatModel()` 是唯一创建 ChatOpenAI 的入口，LlmService 只编排消息与调用，LlmController 暴露 HTTP 路由。为满足 `@Controller('api/langchain')` 与真实路径 `/api/langchain/*`，移除 `main.ts` 的全局前缀，由控制器自带路径。

**Tech Stack:** NestJS 12（ESM，`"type": "module"`，源码 import 带 `.js` 后缀）、LangChain v1（`langchain` / `@langchain/openai` / `@langchain/core`）、js-yaml、dotenv、vitest。

**Spec:** 用户任务描述（2026-10-01，原文约束已逐条收录到下方 Global Constraints）。无独立 spec 文档。

## Global Constraints

- 令牌/密钥/服务地址一律走 `process.env`，绝不写进 YAML 或源码
- 所有路由的 SystemMessage 角色为"需求结构化抽取助手"
- 不要在 Service 里直接 `new ChatOpenAI`，统一用 `createChatModel()`
- 所有能力以 Service 方法 + Controller 路由形式暴露
- 三种路由的演示输入统一使用：`用户注册时必须绑定手机号，密码至少8位`
- `services/chat` 是 ESM 包（`"type": "module"`），源码相对导入必须带 `.js` 后缀
- 服务端口 4001；chat-web 端口 3002（本计划不涉及 chat-web）
- 每个任务结束跑 `bun run typecheck`，通过后按计划给出的 message 提交
- 依赖已预装（用户已提交）：`langchain@^1.5.15`、`@langchain/openai@^1.6.1`、`@langchain/core@^1.2.14`、`js-yaml@^5.4.2`；本计划只新增 `dotenv`
- `services/chat/.gitignore` 已含 `.env`（勿重复添加，Task 1 只做验证）
- 前端无关；不修改 RBAC 相关代码

**范围外（已知问题，本计划不处理）：** `infra/compose/compose.yaml` healthcheck 探活 `/health` 而实际是 `/api/health`；缺 `.dockerignore`；`Dockerfile.chat` 拷贝根 `dist` 与 turbo 实际输出路径不符；chat 的 e2e spec 仍是脚手架遗留断言；`/requirement/extract` 业务入口与 chat-web 页面属下一阶段。

---

### Task 1: 环境前置（dotenv、.env、.env.example、测试脚本）

**Files:**
- Modify: `services/chat/package.json`（新增 dotenv 依赖、`test` 脚本）
- Create: `services/chat/.env`（gitignored，不入库）
- Create: `services/chat/.env.example`（入库模板）

**Interfaces:**
- Consumes: 无
- Produces: `process.env.OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_API_KEY / VECTOR_DB_URL / VECTOR_DB_API_KEY` 在 `nest start` 下可用；`cd services/chat && bun run test` 可执行 vitest

- [ ] **Step 1: 修改 package.json，加 dotenv 与 test 脚本**

`services/chat/package.json` 的 `scripts` 增加：

```json
    "test": "vitest run"
```

`dependencies` 增加（按字母序插入）：

```json
    "dotenv": "^16",
```

- [ ] **Step 2: 安装依赖**

Run: `cd /Users/findream/study/agent-study && bun install`
Expected: `Saved lockfile`，无报错

- [ ] **Step 3: 创建 .env（真实文件，值先留空）**

`services/chat/.env` 完整内容：

```bash
# 令牌与外部服务地址（敏感，走 env 层；本文件已被 .gitignore 排除）
# OPENAI_API_KEY 留空时，/api/langchain/* 路由返回 503 提示
OPENAI_API_KEY=
# OpenAI 兼容网关地址；GLM: https://open.bigmodel.cn/api/paas/v4  DeepSeek: https://api.deepseek.com
OPENAI_BASE_URL=
EMBEDDING_API_KEY=
VECTOR_DB_URL=
VECTOR_DB_API_KEY=
```

- [ ] **Step 4: 创建 .env.example（入库模板）**

`services/chat/.env.example` 内容与 Step 3 相同（文件名不同，两者都提交 example、忽略 .env）。

- [ ] **Step 5: 验证 gitignore 覆盖 .env**

Run: `cd /Users/findream/study/agent-study && git check-ignore -v services/chat/.env && git status --short services/chat/.env`
Expected: 输出匹配规则（如 `services/chat/.gitignore:39:.env`），`git status` 不显示该文件

- [ ] **Step 6: main.ts 显式加载 dotenv**

`services/chat/src/main.ts` 第 1 行（所有 import 之前）加入：

```ts
import 'dotenv/config';
```

- [ ] **Step 7: typecheck 验证**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run typecheck`
Expected: exit 0，无输出错误

- [ ] **Step 8: Commit**

```bash
cd /Users/findream/study/agent-study
git add services/chat/package.json bun.lock services/chat/.env.example services/chat/src/main.ts
git commit -m "feat(chat): add dotenv wiring and llm env templates"
```

---

### Task 2: 配置层（langchain.yaml + 加载校验 + 单元测试）

**Files:**
- Create: `services/chat/config/langchain.yaml`
- Create: `services/chat/src/config/load-langchain-config.ts`
- Test: `services/chat/src/config/load-langchain-config.spec.ts`

**Interfaces:**
- Consumes: `LANGCHAIN_CONFIG_PATH` 环境变量（可选，覆盖 yaml 路径）
- Produces: `loadLangchainConfig(): LangchainConfig`；类型 `LlmRunConfig { model: string; temperature: number; maxTokens: number; timeoutMs: number }`、`RetrievalConfig { topK: number }`、`ToolConfig { name: string; description?: string }`、`LangchainConfig { llm; retrieval; tools: ToolConfig[]; features: Record<string, boolean> }`。Task 3 的 `createChatModel()` 依赖 `loadLangchainConfig().llm`

- [ ] **Step 1: 创建 config/langchain.yaml**

`services/chat/config/langchain.yaml` 完整内容：

```yaml
# LangChain 运行参数（非敏感，随仓库提交）。
# 令牌/密钥/服务地址等敏感信息一律走 .env（process.env），不放在本文件。
llm:
  model: glm-4-flash        # 模型名，需与 .env 的 OPENAI_BASE_URL 配套更换
  temperature: 0            # 采样温度 0~2
  maxTokens: 2048           # 单次生成 token 上限
  timeoutMs: 30000          # 请求超时（毫秒）
retrieval:
  topK: 5                   # 检索返回条数（为 RAG 预留）
tools: []                    # 工具清单（为 Agent 预留），每项形如 { name: xxx }
features:
  streaming: true           # 功能开关示例
```

- [ ] **Step 2: 编写失败的单元测试**

`services/chat/src/config/load-langchain-config.spec.ts` 完整内容：

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadLangchainConfig } from './load-langchain-config.js';

const VALID = `
llm:
  model: glm-4-flash
  temperature: 0
  maxTokens: 2048
  timeoutMs: 30000
retrieval:
  topK: 5
tools: []
features:
  streaming: true
`;

function loadFrom(content: string) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lc-config-'));
  const file = path.join(dir, 'langchain.yaml');
  writeFileSync(file, content);
  const original = process.env.LANGCHAIN_CONFIG_PATH;
  process.env.LANGCHAIN_CONFIG_PATH = file;
  try {
    return loadLangchainConfig();
  } finally {
    if (original === undefined) delete process.env.LANGCHAIN_CONFIG_PATH;
    else process.env.LANGCHAIN_CONFIG_PATH = original;
  }
}

describe('loadLangchainConfig', () => {
  it('解析合法配置', () => {
    expect(loadFrom(VALID)).toEqual({
      llm: { model: 'glm-4-flash', temperature: 0, maxTokens: 2048, timeoutMs: 30000 },
      retrieval: { topK: 5 },
      tools: [],
      features: { streaming: true },
    });
  });

  it('llm.model 缺失时报错', () => {
    expect(() => loadFrom('llm:\n  temperature: 0\n')).toThrow(/llm\.model/);
  });

  it('temperature 超出范围时报错', () => {
    expect(() => loadFrom(VALID.replace('temperature: 0', 'temperature: 9'))).toThrow(/temperature/);
  });

  it('features 值必须为布尔', () => {
    expect(() => loadFrom(VALID.replace('streaming: true', 'streaming: not-bool'))).toThrow(/features\.streaming/);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run test`
Expected: FAIL —— `Cannot find module './load-langchain-config.js'`（或等价的模块不存在错误）

- [ ] **Step 4: 实现 load-langchain-config.ts**

`services/chat/src/config/load-langchain-config.ts` 完整内容：

```ts
import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface LlmRunConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface RetrievalConfig {
  topK: number;
}

export interface ToolConfig {
  name: string;
  description?: string;
}

export interface LangchainConfig {
  llm: LlmRunConfig;
  retrieval: RetrievalConfig;
  tools: ToolConfig[];
  features: Record<string, boolean>;
}

export function langchainConfigPath(): string {
  return (
    process.env.LANGCHAIN_CONFIG_PATH ??
    path.resolve(process.cwd(), 'config/langchain.yaml')
  );
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`langchain.yaml 配置错误：${message}`);
  }
}

export function loadLangchainConfig(): LangchainConfig {
  const raw = yaml.load(readFileSync(langchainConfigPath(), 'utf-8')) as Record<
    string,
    unknown
  >;
  assert(raw && typeof raw === 'object', '根节点必须是对象');

  const llm = raw.llm as Partial<LlmRunConfig> | undefined;
  assert(llm && typeof llm.model === 'string' && llm.model.length > 0, 'llm.model 必须是非空字符串');
  assert(
    typeof llm.temperature === 'number' && llm.temperature >= 0 && llm.temperature <= 2,
    'llm.temperature 必须是 0~2 的数字',
  );
  assert(Number.isInteger(llm.maxTokens) && llm.maxTokens > 0, 'llm.maxTokens 必须是正整数');
  assert(Number.isInteger(llm.timeoutMs) && llm.timeoutMs > 0, 'llm.timeoutMs 必须是正整数');

  const retrieval = raw.retrieval as Partial<RetrievalConfig> | undefined;
  assert(retrieval && Number.isInteger(retrieval.topK) && retrieval.topK > 0, 'retrieval.topK 必须是正整数');

  const tools = raw.tools as ToolConfig[] | undefined;
  assert(Array.isArray(tools), 'tools 必须是数组');
  for (const tool of tools) {
    assert(tool && typeof tool.name === 'string', 'tools 每项必须包含字符串 name');
  }

  const features = raw.features as Record<string, unknown> | undefined;
  assert(features && typeof features === 'object' && !Array.isArray(features), 'features 必须是对象');
  for (const [key, value] of Object.entries(features)) {
    assert(typeof value === 'boolean', `features.${key} 必须是布尔值`);
  }

  return {
    llm: llm as LlmRunConfig,
    retrieval: retrieval as RetrievalConfig,
    tools,
    features: features as Record<string, boolean>,
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run test`
Expected: PASS，4 个用例全绿

- [ ] **Step 6: typecheck**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run typecheck`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
cd /Users/findream/study/agent-study
git add services/chat/config services/chat/src/config
git commit -m "feat(chat): load and validate langchain yaml config"
```

---

### Task 3: 令牌读取 getApiKeys() + 统一模型工厂 createChatModel()

**Files:**
- Create: `services/chat/src/config/api-keys.ts`
- Create: `services/chat/src/llm/model.factory.ts`
- Test: `services/chat/src/llm/model.factory.spec.ts`

**Interfaces:**
- Consumes: `loadLangchainConfig()`（Task 2）、`services/chat/config/langchain.yaml`（cwd 必须是 `services/chat`，vitest 已满足）
- Produces: `getApiKeys(): ApiKeys`，字段 `openAiApiKey / openAiBaseUrl / embeddingApiKey / vectorDbUrl / vectorDbApiKey`（均 `string | undefined`，空串归一为 `undefined`）；`createChatModel(): ChatOpenAI`（无 key 抛 `Error(/OPENAI_API_KEY/)`）。Task 4 的 LlmService 依赖这两个函数

- [ ] **Step 1: 编写失败的单元测试**

`services/chat/src/llm/model.factory.spec.ts` 完整内容：

```ts
import { ChatOpenAI } from '@langchain/openai';
import { afterEach, describe, expect, it } from 'vitest';
import { createChatModel } from './model.factory.js';

describe('createChatModel', () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  });

  it('缺少 OPENAI_API_KEY 时抛出错误', () => {
    delete process.env.OPENAI_API_KEY;
    expect(() => createChatModel()).toThrow(/OPENAI_API_KEY/);
  });

  it('按 YAML 参数创建 ChatOpenAI 实例', () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const model = createChatModel();
    expect(model).toBeInstanceOf(ChatOpenAI);
    expect(model.temperature).toBe(0);
    expect(model.maxTokens).toBe(2048);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run test`
Expected: FAIL —— `model.factory.js` 模块不存在

- [ ] **Step 3: 实现 api-keys.ts**

`services/chat/src/config/api-keys.ts` 完整内容：

```ts
export interface ApiKeys {
  openAiApiKey: string | undefined;
  openAiBaseUrl: string | undefined;
  embeddingApiKey: string | undefined;
  vectorDbUrl: string | undefined;
  vectorDbApiKey: string | undefined;
}

function readKey(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

export function getApiKeys(): ApiKeys {
  return {
    openAiApiKey: readKey('OPENAI_API_KEY'),
    openAiBaseUrl: readKey('OPENAI_BASE_URL'),
    embeddingApiKey: readKey('EMBEDDING_API_KEY'),
    vectorDbUrl: readKey('VECTOR_DB_URL'),
    vectorDbApiKey: readKey('VECTOR_DB_API_KEY'),
  };
}
```

- [ ] **Step 4: 实现 model.factory.ts**

`services/chat/src/llm/model.factory.ts` 完整内容：

```ts
import { ChatOpenAI } from '@langchain/openai';
import { getApiKeys } from '../config/api-keys.js';
import { loadLangchainConfig } from '../config/load-langchain-config.js';

export function createChatModel(): ChatOpenAI {
  const { openAiApiKey, openAiBaseUrl } = getApiKeys();
  if (!openAiApiKey) {
    throw new Error('OPENAI_API_KEY 未配置：请在 services/chat/.env 中填写');
  }
  const { llm } = loadLangchainConfig();
  return new ChatOpenAI({
    model: llm.model,
    temperature: llm.temperature,
    maxTokens: llm.maxTokens,
    timeout: llm.timeoutMs,
    apiKey: openAiApiKey,
    configuration: openAiBaseUrl ? { baseURL: openAiBaseUrl } : undefined,
  });
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run test`
Expected: PASS，6 个用例全绿（含 Task 2 的 4 个）

- [ ] **Step 6: typecheck**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run typecheck`
Expected: exit 0

- [ ] **Step 7: Commit**

```bash
cd /Users/findream/study/agent-study
git add services/chat/src/config/api-keys.ts services/chat/src/llm
git commit -m "feat(chat): api keys reader and unified chat model factory"
```

---

### Task 4: LLM 模块骨架 + POST /api/langchain/invoke

**Files:**
- Create: `services/chat/src/llm/llm.service.ts`
- Create: `services/chat/src/llm/llm.controller.ts`
- Create: `services/chat/src/llm/llm.module.ts`
- Modify: `services/chat/src/main.ts`（删除 `app.setGlobalPrefix('api');`）
- Modify: `services/chat/src/app.controller.ts`（`@Controller()` 改 `@Controller('api')`）
- Modify: `services/chat/src/app.module.ts`（imports 注册 LlmModule）

**Interfaces:**
- Consumes: `createChatModel()`（Task 3）、`getApiKeys()`（Task 3）
- Produces: `LlmService.invoke(input: string): Promise<string>`；`LlmService.buildMessages(input): [SystemMessage, HumanMessage]`；`LlmService.chatModel(): ChatOpenAI`（key 缺失抛 `ServiceUnavailableException`）；导出常量 `SYSTEM_PROMPT`；`LlmModule`（exports LlmService）。Task 5/6 在此文件追加 `stream`/`batch` 方法与路由。HTTP 契约：`POST /api/langchain/invoke`，body 可选 `{ input?: string }`，缺省用统一演示输入，返回 `{ output: string }`

> 为什么移除全局前缀：`main.ts` 现有 `app.setGlobalPrefix('api')` 会把 `@Controller('api/langchain')` 渲染成 `/api/api/langchain`，与要求的真实路径 `/api/langchain/*` 冲突。移除后由 AppController 自带 `'api'` 前缀，`/api/health`、`/api/hello`（chat-web 脚手架在用）保持不变。

- [ ] **Step 1: main.ts 移除全局前缀**

删除 `services/chat/src/main.ts` 中这一行：

```ts
  app.setGlobalPrefix('api');
```

- [ ] **Step 2: app.controller.ts 自带 api 前缀**

`services/chat/src/app.controller.ts` 第 4 行改为：

```ts
@Controller('api')
```

- [ ] **Step 3: 实现 llm.service.ts**

`services/chat/src/llm/llm.service.ts` 完整内容：

```ts
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { getApiKeys } from '../config/api-keys.js';
import { createChatModel } from './model.factory.js';

export const SYSTEM_PROMPT =
  '你是需求结构化抽取助手，负责把用户输入的原始需求描述整理为结构清晰、要点完整的需求说明。';

@Injectable()
export class LlmService {
  chatModel(): ChatOpenAI {
    if (!getApiKeys().openAiApiKey) {
      throw new ServiceUnavailableException(
        'LLM 未就绪：请先在 services/chat/.env 中配置 OPENAI_API_KEY',
      );
    }
    return createChatModel();
  }

  buildMessages(input: string): [SystemMessage, HumanMessage] {
    return [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(input)];
  }

  async invoke(input: string): Promise<string> {
    const response = await this.chatModel().invoke(this.buildMessages(input));
    return LlmService.textOf(response.content);
  }

  private static textOf(content: BaseMessage['content']): string {
    return typeof content === 'string' ? content : JSON.stringify(content);
  }
}
```

- [ ] **Step 4: 实现 llm.controller.ts**

`services/chat/src/llm/llm.controller.ts` 完整内容：

```ts
import { BadRequestException, Body, Controller, Post } from '@nestjs/common';
import { LlmService } from './llm.service.js';

export const DEFAULT_INPUT = '用户注册时必须绑定手机号，密码至少8位';

@Controller('api/langchain')
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  @Post('invoke')
  invoke(@Body() body?: { input?: string }) {
    return this.llm.invoke(this.readInput(body)).then((output) => ({ output }));
  }

  private readInput(body?: { input?: string }): string {
    const input = body?.input ?? DEFAULT_INPUT;
    if (typeof input !== 'string' || !input.trim()) {
      throw new BadRequestException('input 必须是非空字符串');
    }
    return input;
  }
}
```

- [ ] **Step 5: 实现 llm.module.ts 并注册**

`services/chat/src/llm/llm.module.ts` 完整内容：

```ts
import { Module } from '@nestjs/common';
import { LlmController } from './llm.controller.js';
import { LlmService } from './llm.service.js';

@Module({
  controllers: [LlmController],
  providers: [LlmService],
  exports: [LlmService],
})
export class LlmModule {}
```

`services/chat/src/app.module.ts` 改为：

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { LlmModule } from './llm/llm.module.js';

@Module({
  imports: [LlmModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [ ] **Step 6: typecheck**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run typecheck`
Expected: exit 0

- [ ] **Step 7: 启动服务并用 curl 验证 invoke 路由**

终端 A：

```bash
cd /Users/findream/study/agent-study/services/chat && bun run dev
```

终端 B：

```bash
curl -s http://localhost:4001/api/health
# 期望：{"ok":true}（证明移除全局前缀后 /api/* 仍可用）

curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:4001/api/langchain/invoke -H 'Content-Type: application/json' -d '{}'
# 期望：.env 未填真实 Key 时输出 503（LLM 未就绪提示）；填了真实 Key 则为 200

curl -s -X POST http://localhost:4001/api/langchain/invoke -H 'Content-Type: application/json' -d '{"input":"支持微信扫码登录"}'
# 期望：503（无 Key）或 200 且 body 为 {"output":"<需求结构化说明>"}
```

验证完成后 Ctrl-C 停掉终端 A。

- [ ] **Step 8: Commit**

```bash
cd /Users/findream/study/agent-study
git add services/chat/src/main.ts services/chat/src/app.controller.ts services/chat/src/app.module.ts services/chat/src/llm
git commit -m "feat(chat): llm module with invoke route via langchain"
```

---

### Task 5: POST /api/langchain/stream（SSE 流式）

**Files:**
- Modify: `services/chat/src/llm/llm.service.ts`（追加 stream 方法）
- Modify: `services/chat/src/llm/llm.controller.ts`（追加 stream 路由）

**Interfaces:**
- Consumes: `LlmService.chatModel()` / `buildMessages()`（Task 4）、`DEFAULT_INPUT`（Task 4）
- Produces: `LlmService.stream(input: string): AsyncGenerator<string>`；HTTP 契约：`POST /api/langchain/stream`，响应 `text/event-stream`，每个增量块 `data: {"delta":"..."}\n\n`，异常以 `data: {"error":"..."}\n\n` 下发（响应头已发出，无法改状态码），正常收尾 `data: [DONE]\n\n`

- [ ] **Step 1: LlmService 追加 stream 方法**

在 `services/chat/src/llm/llm.service.ts` 的 `invoke` 方法之后追加：

```ts
  async *stream(input: string): AsyncGenerator<string> {
    const chunks = await this.chatModel().stream(this.buildMessages(input));
    for await (const chunk of chunks) {
      yield LlmService.textOf(chunk.content);
    }
  }
```

- [ ] **Step 2: LlmController 追加 stream 路由**

`services/chat/src/llm/llm.controller.ts` 顶部 import 区改为（合并 `Res`，新增 express 类型）：

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { LlmService } from './llm.service.js';
```

类内追加路由：

```ts
  @Post('stream')
  async stream(@Res() res: Response, @Body() body?: { input?: string }) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    try {
      for await (const delta of this.llm.stream(this.readInput(body))) {
        if (delta) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      }
      res.write('data: [DONE]\n\n');
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({
          error: error instanceof Error ? error.message : 'stream failed',
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
```

- [ ] **Step 3: typecheck**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run typecheck`
Expected: exit 0

- [ ] **Step 4: 启动服务并用 curl 验证 stream 路由**

终端 A：`cd services/chat && bun run dev`（同 Task 4 Step 7）

终端 B：

```bash
curl -s -N -X POST http://localhost:4001/api/langchain/stream -H 'Content-Type: application/json' -d '{}'
# 期望（无 Key）：一条 data: {"error":"LLM 未就绪：..."} 事件后连接关闭
# 期望（有 Key）：持续输出 data: {"delta":"..."} 增量块，最后 data: [DONE]
```

验证完成后停掉服务。

- [ ] **Step 5: Commit**

```bash
cd /Users/findream/study/agent-study
git add services/chat/src/llm/llm.service.ts services/chat/src/llm/llm.controller.ts
git commit -m "feat(chat): sse streaming route for chat model"
```

---

### Task 6: POST /api/langchain/batch（并发批量）

**Files:**
- Modify: `services/chat/src/llm/llm.service.ts`（追加 batch 方法）
- Modify: `services/chat/src/llm/llm.controller.ts`（追加 batch 路由）

**Interfaces:**
- Consumes: `LlmService.chatModel()` / `buildMessages()`（Task 4）、`DEFAULT_INPUT`（Task 4）
- Produces: `LlmService.batch(inputs: string[]): Promise<string[]>`；HTTP 契约：`POST /api/langchain/batch`，body 可选 `{ inputs?: string[] }`，缺省 `[DEFAULT_INPUT]`，1~10 条非空字符串，返回 `{ outputs: string[] }`（与 inputs 等长、按序对应）

- [ ] **Step 1: LlmService 追加 batch 方法**

在 `services/chat/src/llm/llm.service.ts` 的 `stream` 方法之后追加：

```ts
  async batch(inputs: string[]): Promise<string[]> {
    const responses = await this.chatModel().batch(
      inputs.map((input) => this.buildMessages(input)),
    );
    return responses.map((response) => LlmService.textOf(response.content));
  }
```

- [ ] **Step 2: LlmController 追加 batch 路由**

`services/chat/src/llm/llm.controller.ts` 常量区追加：

```ts
const MAX_BATCH = 10;
```

类内追加路由：

```ts
  @Post('batch')
  batch(@Body() body?: { inputs?: string[] }) {
    const inputs = body?.inputs ?? [DEFAULT_INPUT];
    if (
      !Array.isArray(inputs) ||
      inputs.length === 0 ||
      inputs.length > MAX_BATCH ||
      inputs.some((input) => typeof input !== 'string' || !input.trim())
    ) {
      throw new BadRequestException(`inputs 必须是 1~${MAX_BATCH} 条非空字符串`);
    }
    return this.llm.batch(inputs).then((outputs) => ({ outputs }));
  }
```

- [ ] **Step 3: typecheck + 全量单测**

Run: `cd /Users/findream/study/agent-study/services/chat && bun run typecheck && bun run test`
Expected: typecheck exit 0；6 个用例 PASS

- [ ] **Step 4: 启动服务并用 curl 验证 batch 路由与统一输入**

终端 A：`cd services/chat && bun run dev`（同 Task 4 Step 7）

终端 B：

```bash
curl -s -X POST http://localhost:4001/api/langchain/batch -H 'Content-Type: application/json' -d '{"inputs":["用户注册时必须绑定手机号，密码至少8位","支持导出 Excel 报表"]}'
# 期望（无 Key）：503；有 Key：{"outputs":["<第一条的结构化说明>","<第二条的结构化说明>"]}

curl -s -X POST http://localhost:4001/api/langchain/batch -H 'Content-Type: application/json' -d '{"inputs":[]}'
# 期望：400 inputs 必须是 1~10 条非空字符串
```

三条路由最终验收（有真实 Key 时逐条执行，输入统一用默认演示文案）：

```bash
curl -s -X POST http://localhost:4001/api/langchain/invoke -H 'Content-Type: application/json' -d '{}'
curl -s -N -X POST http://localhost:4001/api/langchain/stream -H 'Content-Type: application/json' -d '{}'
curl -s -X POST http://localhost:4001/api/langchain/batch -H 'Content-Type: application/json' -d '{}'
```

验证完成后停掉服务。

- [ ] **Step 5: Commit**

```bash
cd /Users/findream/study/agent-study
git add services/chat/src/llm/llm.service.ts services/chat/src/llm/llm.controller.ts
git commit -m "feat(chat): batch route for chat model"
```

---

## 执行记录与偏差（2026-10-03）

1. **yaml 结构以用户已有文件为准**：用户预先创建了 `config/langchain.yaml`（含 `llm.provider`、`retrieval.enabled`、tools/features 为布尔开关对象），与计划草稿的 `tools: []`/`features.streaming` 结构不同。按用户结构实现加载器；并修复原文件 9 处 `key:value` 冒号缺空格的 YAML 语法错误，补 `llm.timeoutMs: 30000`。
2. **js-yaml v5 是 ESM 入口**：`import yaml from 'js-yaml'` 默认导出为 undefined，必须 `import { load as loadYaml } from 'js-yaml'`。
3. **TS 断言收窄限制**：复合条件（`a && typeof a.x === 'number'`）经 `asserts condition` 不收窄变量本身；`Number.isInteger()` 不是类型守卫。解法：先 `assert(x !== undefined)` 再断言属性，并提取 `assertPositiveInt` / `assertBooleanMap`（`asserts value is number | Record<string, boolean>`）辅助函数。
4. **上游网关更换**：用户 .env 中教程复制的 `https://api.amux.ai/v1` 实测 HTTPS 连接超时（DNS 可解析、TCP 不通），经用户同意改为 `https://open.bigmodel.cn/api/paas/v4`，yaml `model` 配套改为 `glm-4-flash`；`.env`/`.env.example` 补充三家网关备选注释。
5. **工厂增加 `maxRetries: 0`**：OpenAI SDK 默认重试 2 次，上游不可达时单请求会拖 ~90s；关闭重试后按 `timeoutMs`（30s）快速失败。
6. **脚手架 e2e 修复（前置）**：`test/app.e2e-spec.ts` 的 `import { App } from 'supertest/types'` 在 nodenext 下无法解析（supertest 7.2.2 无 exports 字段，禁用子路径回退），改为普通 `INestApplication`，独立提交 `bc932fc`。
7. **验证口径**：机器上无真实 LLM key，运行时验证覆盖确定性路径——`/api/health` 200、invoke/stream/batch 无 key 时 503 兜底、SSE 错误以 `data:` 事件下发、input/inputs 非法输入 400、单测 8/8、全仓 typecheck 6/6。真实模型输出待用户在 `.env` 填入 GLM key 并重启服务后按 Task 6 Step 4 的三条 curl 验收。

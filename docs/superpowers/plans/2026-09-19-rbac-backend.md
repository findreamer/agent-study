# RBAC 后端实施计划（services/user-system + packages/database）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付多应用 RBAC 后端：账号密码登录、AT/RT 双令牌（轮换+复用检测）、系统隔离角色、三态菜单树权限码、部门树与角色级数据范围。

**Architecture:** NestJS 12 单体服务（端口 4002，全局前缀 `/api`）；Prisma 6 + PostgreSQL；共享 zod 契约在 `@agent-study/contracts`；两道全局 Guard（JWT → 权限），权限实时查库；可复用数据范围 where 过滤器；审计只埋点（pino stdout JSON）。

**Tech Stack:** Bun 1.4、NestJS 12、Prisma 6、@nestjs/jwt、@nestjs/throttler、argon2、cookie-parser、pino、vitest + supertest。

**Spec:** `docs/superpowers/specs/2026-09-19-rbac-design.md`

## Global Constraints

- ESM 工程：所有相对 import **必须带 `.js` 后缀**（NodeNext），模仿 services/chat 现有写法。
- 端口：user-system **4002**；PostgreSQL 宿主映射 **5432**，库名 `agent_study`，测试库 `agent_study_test`。
- 全局前缀 `/api`；统一响应壳 `{ code: 0, data, message: 'ok' }`；错误 `{ code, message }`；HTTP 语义 401/403/404/409/422。
- 权限实时查库，不写入 JWT；JWT claims 仅 `sub/username/isSuperadmin/systemId`，AT TTL 1d，RT TTL 30d。
- RT 仅经 httpOnly cookie（名 `rt`，path `/api/auth/refresh`，SameSite=Lax，生产 Secure）；AT 在响应体。
- 密码哈希 argon2id；用户不物理删除只禁用；禁用即吊销全部 RT family。
- 所有新增 DTO/枚举/响应类型放 `packages/contracts`，前后端只从这里引用。
- 每个 Task 结束跑 `bun run typecheck` 与相关测试，通过后按给出的 message 提交。
- 数据库相关测试默认假设本机 postgres 可连（compose 起的库）；纯逻辑单测 mock Prisma。

## File Structure

```
packages/database/
  package.json, tsconfig.json
  prisma/schema.prisma
  prisma/seed.ts                    # Task 14 幂等种子
  src/index.ts                      # re-export PrismaService + client 类型/枚举
  src/prisma.service.ts             # Task 2
services/user-system/
  package.json tsconfig.json tsconfig.build.json nest-cli.json vitest.config.ts vitest.config.e2e.ts
  .env.example
  src/main.ts
  src/app.module.ts
  src/common/
    config/env.ts                   # zod 校验环境变量
    prisma/prisma.module.ts
    filters/http-exception.filter.ts
    interceptors/transform.interceptor.ts
    pipes/zod-validation.pipe.ts
    audit/audit.service.ts audit.module.ts
    decorators/public.decorator.ts permissions.decorator.ts current-user.decorator.ts
    guards/jwt-auth.guard.ts permissions.guard.ts
    rbac/permissions.service.ts data-scope.service.ts
    auth/token.service.ts password.service.ts auth.constants.ts
  src/modules/auth/{auth.module,auth.controller,auth.service}.ts
  src/modules/users/...
  src/modules/roles/...
  src/modules/systems/...
  src/modules/menus/...
  src/modules/departments/...
  test/auth.e2e-spec.ts
packages/contracts/src/
  enums.ts auth.ts user.ts role.ts system.ts menu.ts department.ts common.ts index.ts
```

---

### Task 1: 工程底座与 PostgreSQL

**Files:**
- Create: `packages/database/{package.json,tsconfig.json,prisma/schema.prisma(占位),src/index.ts}`
- Create: `services/user-system/{package.json,tsconfig.json,tsconfig.build.json,nest-cli.json,vitest.config.ts,vitest.config.e2e.ts,.env.example}` 与 `src/{main.ts,app.module.ts}`
- Modify: `infra/compose/compose.dev.yaml`、`infra/compose/compose.yaml`、根 `package.json`、`tsconfig.base.json`

**Interfaces:**
- Produces: `bun run dev --filter=@agent-study/user-system` 可启动并返回 `/api/health`；`docker compose ... up postgres` 健康。

- [ ] **Step 1: 写 packages/database/package.json**

```json
{
  "name": "@agent-study/database",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./prisma": "./src/generated/client/index.ts"
  },
  "types": "./src/index.ts",
  "scripts": {
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev --schema=prisma/schema.prisma",
    "prisma:deploy": "prisma migrate deploy --schema=prisma/schema.prisma",
    "db:seed": "bun run prisma/seed.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0"
  },
  "devDependencies": {
    "prisma": "^6.1.0",
    "typescript": "^5.7.0",
    "@types/node": "^24.0.0"
  }
}
```

tsconfig 仿 packages/contracts（extends ../../tsconfig.base.json，outDir dist/rootDir src）。`src/index.ts` 先 `export {};`。

prisma/schema.prisma 占位（Task 2 覆盖）：

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/client"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 2: 写 services/user-system/package.json**

关键依赖（版本）：`@nestjs/common @nestjs/core @nestjs/platform-express ^12`、`@nestjs/jwt ^11`、`@nestjs/throttler ^6.4`、`@prisma/client ^6.1`、`@agent-study/database workspace:*`、`@agent-study/contracts workspace:*`、`argon2 ^0.41.1`、`cookie-parser ^1.4.7`、`pino ^9.6.0`、`reflect-metadata`、`rxjs ^7.8`、`zod ^3.25`；devDeps 仿 services/chat（nest-cli/schemas/testing ^12、vitest ^4、vite-tsconfig-paths、supertest、typescript 5.7、@types/cookie-parser、@types/express）。scripts：

```json
"dev": "nest start --watch",
"build": "rm -rf dist tsconfig.tsbuildinfo && nest build",
"start": "bun run dist/main.js",
"typecheck": "tsc --noEmit",
"lint": "tsc --noEmit",
"test": "vitest run",
"test:e2e": "vitest run --config vitest.config.e2e.ts"
```

tsconfig.json 直接复制 services/chat 的（NodeNext + decorators + vitest globals）；tsconfig.build.json、nest-cli.json、两个 vitest.config 同样复制（e2e include `**/*.e2e-spec.ts`）。

- [ ] **Step 3: .env.example 与 compose postgres**

`services/user-system/.env.example`：

```
DATABASE_URL=postgresql://agent:agent@localhost:5432/agent_study?schema=public
JWT_SECRET=dev-only-change-me-32+chars-secret-key
JWT_AT_TTL=1d
RT_TTL_DAYS=30
COOKIE_DOMAIN=localhost
CORS_ORIGIN=http://localhost:3003
PORT=4002
SEED_ADMIN_USERNAME=admin
SEED_ADMIN_PASSWORD=Admin@123456
```

在 `infra/compose/compose.yaml` 增加 service（compose.dev.yaml 同样追加以支持仅本地编排）：

```yaml
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: agent
      POSTGRES_DB: agent_study
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U agent -d agent_study"]
      interval: 5s
      timeout: 3s
      retries: 10
```
文件根部加 `volumes: { postgres-data: {} }`。

- [ ] **Step 4: 根脚本与路径**

根 package.json：`clean:ports` 加 4002 3003；新增 `"dev:user-system": "turbo run dev --filter=@agent-study/user-system"`（暂不动总 dev，避免影响 chat）。tsconfig.base.json paths 增加：

```json
"@agent-study/database": ["./packages/database/src/index.ts"],
"@agent-study/database/*": ["./packages/database/src/*"]
```

- [ ] **Step 5: 最小可启动服务**

`src/main.ts` 仿 chat（`.js` 后缀、`setGlobalPrefix('api')`、CORS 读 `CORS_ORIGIN`、PORT 4002）；`app.module.ts` 提供 `GET /api/health` 返回 `{ status: 'ok' }`。

- [ ] **Step 6: 安装、起库、验证**

```bash
bun install
(cd infra/compose && docker compose -f compose.dev.yaml up -d postgres)
bun run --filter @agent-study/database prisma:generate
bun run --filter @agent-study/user-system dev &  # curl http://localhost:4002/api/health
```
Expected: `{"code":0,...}` 或 `{status:'ok'}`（响应壳 Task 4 才统一，此步裸返回即可）；`docker ps` 中 postgres healthy。

- [ ] **Step 7: Commit** `feat(user-system): scaffold workspace and postgres`

---

### Task 2: Prisma Schema（8 表）+ 迁移 + PrismaService

**Files:**
- Create/覆写: `packages/database/prisma/schema.prisma`
- Create: `packages/database/src/prisma.service.ts`、`packages/database/src/index.ts`

**Interfaces:**
- Produces: `PrismaService extends PrismaClient`（模块由各服务自建）；导出生成 client 的全部类型与 5 个枚举：`UserStatus/CommonStatus/MenuType/DataScope`（System 用 CommonStatus）。

- [ ] **Step 1: 写完整 schema**

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/client"
}
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserStatus   { ACTIVE DISABLED }
enum CommonStatus { ENABLED DISABLED }
enum MenuType     { DIR MENU BUTTON }
enum DataScope    { ALL DEPT_AND_SUB DEPT SELF }

model System {
  id        String       @id @default(cuid())
  code      String       @unique
  name      String
  status    CommonStatus @default(ENABLED)
  sort      Int          @default(0)
  roles     Role[]
  menus     Menu[]
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
}

model Department {
  id        String       @id @default(cuid())
  parentId  String?
  parent    Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children  Department[] @relation("DeptTree")
  name      String
  leader    String?
  sort      Int          @default(0)
  status    CommonStatus @default(ENABLED)
  users     User[]
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  @@index([parentId])
}

model User {
  id            String         @id @default(cuid())
  username      String         @unique
  passwordHash  String
  nickname      String
  email         String?
  status        UserStatus     @default(ACTIVE)
  isSuperadmin  Boolean        @default(false)
  departmentId  String?
  department    Department?    @relation(fields: [departmentId], references: [id])
  lastLoginAt   DateTime?
  roles         UserRole[]
  refreshTokens RefreshToken[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  @@index([departmentId])
}

model Role {
  id        String       @id @default(cuid())
  systemId  String
  system    System       @relation(fields: [systemId], references: [id])
  code      String
  name      String
  status    CommonStatus @default(ENABLED)
  priority  Int          @default(100)
  dataScope DataScope    @default(SELF)
  remark    String?
  users     UserRole[]
  menus     RoleMenu[]
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  @@unique([systemId, code])
  @@index([systemId])
}

model Menu {
  id             String       @id @default(cuid())
  systemId       String
  system         System       @relation(fields: [systemId], references: [id])
  parentId       String?
  parent         Menu?        @relation("MenuTree", fields: [parentId], references: [id])
  children       Menu[]       @relation("MenuTree")
  type           MenuType
  name           String
  path           String?
  component      String?
  icon           String?
  permissionCode String?
  visible        Boolean      @default(true)
  status         CommonStatus @default(ENABLED)
  sort           Int          @default(0)
  roles          RoleMenu[]
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  @@unique([systemId, permissionCode])
  @@index([systemId, parentId])
}

model UserRole {
  userId String
  roleId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([userId, roleId])
  @@index([roleId])
}

model RoleMenu {
  roleId String
  menuId String
  role   Role @relation(fields: [roleId], references: [id], onDelete: Cascade)
  menu   Menu @relation(fields: [menuId], references: [id], onDelete: Cascade)
  @@id([roleId, menuId])
  @@index([menuId])
}

model RefreshToken {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  familyId        String
  tokenHash       String    @unique
  expiresAt       DateTime
  rotatedAt       DateTime?
  revokedAt       DateTime?
  reuseFlaggedAt  DateTime?
  userAgent       String?
  ip              String?
  createdAt       DateTime  @default(now())
  @@index([userId, familyId])
}
```

- [ ] **Step 2: 迁移**

Run: `bun run --filter @agent-study/database prisma:migrate -- --name init`
Expected: 生成 prisma/migrations，8 表 4 枚举创建成功。

- [ ] **Step 3: PrismaService 与导出**

`src/prisma.service.ts`：`PrismaService extends PrismaClient implements OnModuleInit { onModuleInit(){ return this.$connect() } }`，`enableShutdownHooks` 非必需（Nest 12/Prisma 6 已处理）。`src/index.ts`：

```ts
export * from './prisma.service.js';
export * from './generated/client/index.js';
```

- [ ] **Step 4: 验证生成产物被 gitignore**

确认 `packages/database/src/generated/` 不出现在 `git status`（.gitignore 第 23 行已含）。

- [ ] **Step 5: Commit** `feat(database): prisma schema for RBAC (8 models)`

---

### Task 3: contracts 共享契约

**Files:**
- Create: `packages/contracts/src/{enums.ts,common.ts,auth.ts,user.ts,role.ts,system.ts,menu.ts,department.ts}`，修改 `index.ts` 全量 re-export。

**Interfaces:**
- Produces（后续所有 Task 依赖，名称不可变）：
- 枚举映射：`UserStatusEnum = z.enum(['ACTIVE','DISABLED'])` 等 4 个；TS 类型 `UserStatus/CommonStatus/MenuType/DataScope`。
- 响应壳：`okSchema<T>` 用法 `z.object({ code: z.literal(0), data: z.unknown(), message: z.string() })`；导出类型 `ApiOk<T>`。
- Auth：`loginSchema = { username: 4..32, password: 8..64 }`；`switchSystemSchema = { systemCode: string().min(1) }`；`changePasswordSchema = { oldPassword, newPassword: 8..64 }`。
- `menuNodeSchema`：`{id, parentId nullable, type, name, path?, component?, icon?, permissionCode?, visible, sort, children? }`；`profileResponseSchema = { user: userBriefSchema, currentSystemCode, systems: systemBriefSchema.array(), menus: menuNodeSchema.array(), permissions: z.string().array() }`。
- User：`createUserSchema {username, password, nickname, email?, departmentId?, roleIds: string().array().default([])}`；`updateUserSchema` 全部可选（无 password）；`resetPasswordSchema { newPassword }`；`userBriefSchema {id, username, nickname, email, status, isSuperadmin, departmentId?}`。
- Role：`createRoleSchema {systemId, code ^[a-z0-9_-]+$, name, priority int nonnegative, dataScope enum, remark?, menuIds: string[].default([])}`；`updateRoleSchema`（systemId 不可改；其余可选含 menuIds）。
- System：`createSystemSchema {code, name, sort?, status?}`、update 全可选。
- Menu：`createMenuSchema {systemId, parentId?, type, name, path?, component?, icon?, permissionCode?, visible?, sort?, status?}`；update 全可选（systemId 不可改）。
- Department：`createDepartmentSchema {parentId?, name, leader?, sort?}`；update 全可选。
- 列表查询：`listQuerySchema = { page: z.coerce.number().min(1).default(1), pageSize: z.coerce.number().min(1).max(100).default(20), keyword: z.string().optional() }`（分页响应 `{ items, total, page, pageSize }`）。

- [ ] **Step 1: 逐文件实现上述 zod schema 与 inferred type 导出**（每个 `export type X = z.infer<typeof xSchema>`）。
- [ ] **Step 2: index.ts re-export 全部**。
- [ ] **Step 3: 验证** `bun run --filter @agent-study/contracts typecheck` 通过；被 user-system 引用前不写测试。
- [ ] **Step 4: Commit** `feat(contracts): zod schemas for RBAC`

---

### Task 4: 横切设施（config / 响应壳 / 异常 / Zod 管道 / 审计）

**Files:**
- Create: `src/common/config/env.ts`、`filters/http-exception.filter.ts`、`interceptors/transform.interceptor.ts`、`pipes/zod-validation.pipe.ts`、`audit/{audit.service.ts,audit.module.ts}`、`prisma/prisma.module.ts`
- Modify: `src/main.ts`、`src/app.module.ts`

**Interfaces:**
- Produces: `Env`（类型化环境变量）；`AuditService.log(input: AuditInput): void`，`AuditInput = { event: string; targetType?: string; targetId?: string; before?: unknown; after?: unknown }`（ip/ua 由服务内部从请求上下文取，取不到留空——实现为从 AsyncLocalStorage 读取，ALS 在中间件中设置；简化允许：controller 显式传 ip/ua，AuditInput 含可选 `ip?/ua?/actorId?`）；全局响应壳与 422 校验错误；`ZodValidationPipe`。

- [ ] **Step 1: env.ts** — zod schema 校验 Global Constraints 中全部 env（JWT_AT_TTL 字符串原样、RT_TTL_DAYS coerce number、JWT_SECRET min 16），导出 `const env = envSchema.parse(process.env)`。
- [ ] **Step 2: PrismaModule** — `@Global()` module 提供并导出 `PrismaService`（from `@agent-study/database`）。
- [ ] **Step 3: ZodValidationPipe**

```ts
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}
  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new UnprocessableEntityException({
        message: 'Validation failed',
        issues: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}
```

- [ ] **Step 4: TransformInterceptor** — `tap` 把返回值包成 `{ code: 0, data: res, message: 'ok' }`。
- [ ] **Step 5: HttpExceptionFilter** — 从异常取 status/message，422 透传 issues，输出 `{ code: status, message, ...(issues?) }`。
- [ ] **Step 6: AuditService** — pino 实例（`pino({ base: { service: 'user-system' } }`），`log()` 输出一行 JSON（含时间、event、actorId、target、before/after、ip、ua）；AuditModule `@Global()` 导出。
- [ ] **Step 7: main.ts 接线** — cookieParser、`app.useGlobalPipes`（注意 ZodPipe 是路由级使用，不全局注册）、全局 filter + interceptor、CORS `{ origin: env.CORS_ORIGIN, credentials: true }`。
- [ ] **Step 8: app.module** — import PrismaModule、AuditModule；health 控制器验证响应壳变为 `{code:0,...}`。
- [ ] **Step 9: 验证** `curl localhost:4002/api/health` 返回统一壳；typecheck 通过。
- [ ] **Step 10: Commit** `feat(user-system): cross-cutting config, response shell, audit sink`

---

### Task 5: 密码与令牌服务（TDD）

**Files:**
- Create: `src/common/auth/{password.service.ts,token.service.ts,auth.constants.ts}`、对应 `.spec.ts`
- Modify: app.module（或后续 AuthModule 内 providers）

**Interfaces:**
- Produces:
- `PasswordService.hash(plain): Promise<string>` / `verify(hash, plain): Promise<boolean>`（argon2id，参数 `{ type: argon2.argon2id, memorySize: 19456, timeCost: 2 }`）。
- `TokenService`（依赖 PrismaService、`@nestjs/jwt` 的 JwtService、env）：
  - `issueFamily(user: {id: string}, ctx: {ua?: string; ip?: string}, systemId: string): Promise<{ accessToken: string; refreshToken: string }>`
  - `rotate(rawRefreshToken: string, ctx): Promise<{ accessToken: string; refreshToken: string }>`，三种结局：正常返回；抛 `ReuseDetectedException`（401，message 'token reuse detected'，内部已吊销整族）；抛标准 `UnauthorizedException`。
  - `revokeFamily(familyId: string): Promise<void>`；`revokeAllFamilies(userId: string): Promise<void>`；`revokeOthers(userId, keepFamilyId)`。
  - `verifyAccessToken(token): JwtPayload`（JwtPayload = `{ sub, username, isSuperadmin, systemId }`）。
  - `listFamilies(userId): Promise<SessionInfo[]>`，`SessionInfo = { familyId, userAgent, ip, lastUsedAt(取该族最新 createdAt/rotatedAt), current: false }`。
  - 内部：`sha256(raw)` 存 tokenHash；RT 用 `randomBytes(48).toString('base64url')`，familyId `randomUUID()`；AT 签发 `jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_AT_TTL })`。
- 常量 `REFRESH_COOKIE = 'rt'`、`AT_TTL_MS`（1d）、`RT_TTL_MS`（30d，从 env RT_TTL_DAYS 算）。

- [ ] **Step 1: 写 token.service.spec.ts（先失败）**，用 mock PrismaService（手写 in-memory 数组模拟 refreshToken 表：create/findUnique/updateMany/findFirst）覆盖：
  1. `issueFamily` 落一条未轮换记录且返回两枚 token；
  2. `rotate` 正常：旧记录 rotatedAt 置位、新记录同 familyId；
  3. **复用检测**：对已 rotated 的 raw token 再 rotate → 抛 ReuseDetectedException，且该 family 全部记录 revokedAt 置位（断言 updateMany 收到 `{ where: { familyId }, data: { revokedAt: 有值 } }`）；
  4. 未命中 token / expiresAt 已过 → UnauthorizedException；
  5. revokeOthers 只保留指定 family。
  提示：mock 中要能按 tokenHash 找回 raw 对应的记录——用真实 sha256 计算（node:crypto）而不是 mock hash。
- [ ] **Step 2: Run** `bun run --filter @agent-study/user-system test -- src/common/auth/token.service.spec.ts`，Expected FAIL（模块不存在）。
- [ ] **Step 3: 实现 PasswordService 与 TokenService**（含 ReuseDetectedException extends UnauthorizedException）。cookie 由 controller 层负责，TokenService 不碰响应对象。
- [ ] **Step 4: Run 测试** PASS；`bun run typecheck` PASS。
- [ ] **Step 5: Commit** `feat(user-system): password and rotating refresh-token services`

---

### Task 6: Auth 模块——登录 / 刷新 / 登出

**Files:**
- Create: `src/modules/auth/{auth.module.ts,auth.controller.ts,auth.service.ts,auth.service.spec.ts}`
- Create: `src/common/decorators/{public.decorator.ts,current-user.decorator.ts}`
- Modify: `src/main.ts`（throttler 由 module APP_GUARD 注册）

**Interfaces:**
- Consumes: Task 5 TokenService、contracts loginSchema、PrismaService、AuditService。
- Produces: `POST /api/auth/login`、`POST /api/auth/refresh`、`POST /api/auth/logout`；`AuthService` 的 profile/switch/sessions 方法在 Task 13 补。
- `@Public()` 装饰器（`SetMetadata('isPublic', true)`）；`@CurrentUser()` 参数装饰器（从 `request.user` 取 `AuthUser = { id, username, isSuperadmin, departmentId: string|null, systemId }`）。

- [ ] **Step 1: 失败用例 auth.service.spec.ts**（mock Prisma + TokenService）：
  - 用户不存在/密码错误/被禁用 → 同一 `UnauthorizedException('invalid credentials')`；失败分支 audit.log 被以 `event:'login_failed'` 调用；
  - 成功登录返回 `{ accessToken, refreshToken, profile }`，profile 结构同 contracts profileResponseSchema 的 data（menus/permissions 当前系统）；默认系统：超管 → `admin`，普通用户 → 其启用角色所属系统按 sort 第一个；一个系统都没有 → 抛 403 `no accessible system`。
- [ ] **Step 2: 实现 AuthService.login**：校验 → 更新 lastLoginAt → issueFamily → 组装 profile（菜单/权限聚合逻辑本 Task 先内联一个私有 `buildProfile(user, systemCode)`，Task 7 抽出到 PermissionsService 后改为调用）。
- [ ] **Step 3: AuthController**：
  - `login(@Body(new ZodValidationPipe(loginSchema)) , @Req() req, @Res({passthrough:true}) res)`：调 service，`res.cookie(REFRESH_COOKIE, rt, { httpOnly:true, sameSite:'lax', secure:false, path:'/api/auth/refresh', maxAge: RT_TTL_MS, domain: env.COOKIE_DOMAIN || undefined })`，返回 `{ accessToken, profile }`（RT 不进 body）。secure 用 `process.env.NODE_ENV==='production'`。
  - `refresh(@Req())`：读 cookie rt → `tokenService.rotate(rt, ctx)` → 重设 cookie → 返回 `{ accessToken }`（ReuseDetected 时先清 cookie 再 401）。
  - `logout(@CurrentUser() user, @Req())`：按当前 family（AT 不带 familyId——从 cookie 的 rt 反查 hash 取 familyId；查不到也返回成功）吊销，清 cookie。
  - login/refresh 标记 `@Public()`。
- [ ] **Step 4: ThrottlerModule**：`ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])` + `{ provide: APP_GUARD, useClass: ThrottlerGuard }`，仅 login 通过 `@Throttle({ default: { limit: 10 }})` 显式声明（全局限流即可接受）。
- [ ] **Step 5: 全局 JwtAuthGuard 占位**：本 Task 先实现最小版（见 Task 7 完整版）——从 Authorization Bearer 解析 AT，`@Public()` 放行，失败 401；挂载为 APP_GUARD。
- [ ] **Step 6: Run 单测 + 手工验证**：起库后 `curl -X POST localhost:4002/api/auth/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"Admin@123456"}'`（此时无种子数据，预期 401 invalid credentials——证明链路通）；错误 body 应为统一壳 422（缺字段）与 401（凭证错）。
- [ ] **Step 7: Commit** `feat(user-system): login, refresh rotation, logout`

---

### Task 7: 权限体系——PermissionsService / Guards / DataScope（TDD）

**Files:**
- Create: `src/common/rbac/{permissions.service.ts,data-scope.service.ts}.ts` + 两份 `.spec.ts`
- Create: `src/common/guards/{jwt-auth.guard.ts,permissions.guard.ts}`、`src/common/decorators/permissions.decorator.ts`

**Interfaces:**
- Produces:
- `PermissionsService.getCodes(userId, systemId): Promise<string[]>`——启用角色 ∪ RoleMenu ∪ 启用菜单的 permissionCode 去重（跳过 null）。
- `PermissionsService.getMenuTree(userId, systemId)`——同条件取全部节点（含 DIR，visible 不过滤，过滤交给前端），构建树（按 sort 排序）。
- `PermissionsService.accessibleSystems(userId): Promise<System[]>`——超管返回全部启用系统；否则返回用户启用角色所属的去重启用系统。
- `DataScopeService.buildFilter(user: AuthUser, systemId: string): Promise<Prisma.UserWhereInput>`（本期专用于 User 模型，返回字段为 User where：ALL/超管 `{}`；DEPT_AND_SUB `{ departmentId: { in: ids } }`；DEPT `{ departmentId: user.departmentId }`；无部门用户遇到 DEPT/DEPT_AND_SUB 退化为 `{ id: user.id }`；SELF `{ id: user.id }`）。多角色取最宽。
- `DepartmentTreeDao`：`getDepartmentAndDescendantIds(rootId): Promise<string[]>`——递归 CTE：
  ```sql
  WITH RECURSIVE tree AS (
    SELECT id FROM "Department" WHERE id = $1
    UNION ALL SELECT d.id FROM "Department" d JOIN tree t ON d."parentId" = t.id
  ) SELECT id FROM tree
  ```
  用 `prisma.$queryRaw`。
- `@Permissions(...codes: string[])`（metadata key `permissions`）。
- 完整 `JwtAuthGuard`：`@Public()` 放行；Bearer 解析 + tokenService.verifyAccessToken；**每请求查库**加载用户（`prisma.user.findUnique`），不存在或 DISABLED → 401；挂 `request.user: AuthUser`（systemId 来自 token）。
- `PermissionsGuard`：无 `@Permissions` 元数据放行；isSuperadmin 放行；否则 `permissionsService.getCodes`，元数据要求的码全部命中才放行，否则 403。
- 两 Guard 均 APP_GUARD 注册，顺序 JwtAuthGuard 在前。

- [ ] **Step 1: permissions.service.spec.ts**（mock prisma，造角色/菜单数据集）覆盖：并集去重、DISABLED 角色/菜单排除、跨系统不串、超管不走此服务（由 guard 短路，单测只测服务）。
- [ ] **Step 2: data-scope.service.spec.ts**：四种范围、双角色取最宽（DEPT+SELF→DEPT）、无部门退化、超管 `{}`；mock `$queryRaw` 返回 id 数组。
- [ ] **Step 3: Run 确认失败** → 实现两个 service（菜单建树用纯函数 `buildTree(nodes)`，放 `rbac/build-tree.ts` 并单测：sort 排序、孤儿节点忽略）。
- [ ] **Step 4: 实现 decorators 与两个 guard；app.module 注册顺序**。
- [ ] **Step 5: 重构 AuthService.buildProfile 改调 PermissionsService/accessibleSystems**。
- [ ] **Step 6: Run 全部单测 + typecheck**。
- [ ] **Step 7: Commit** `feat(user-system): permission guards and data-scope service`

---

### Task 8: Departments 模块

**Files:**
- Create: `src/modules/departments/{departments.module,controller,service}.ts`
- Modify: `src/app.module.ts`

**Interfaces:** `GET /departments/tree`（全量树，管理用）、`POST /departments`（`department:create`）、`PATCH /departments/:id`（`department:update`）、`DELETE /departments/:id`（`department:delete`，存在子部门或关联用户 → 409 `department has children or users`）。父部门不能设为自己或自己后代（防环，更新时校验，违规 422）。

- [ ] **Step 1: service 单测**（mock prisma）：建树立序、删除冲突分支抛 409、防环分支（把后代 id 集合作为 parentId → 422）。
- [ ] **Step 2: 实现 service/controller**，全部挂 `@Permissions`；DTO 用 contracts + ZodValidationPipe；写操作调 audit `department_created/updated/deleted`（after/before）。
- [ ] **Step 3: typecheck + 测试 + Commit** `feat(user-system): departments tree CRUD`

---

### Task 9: Users 模块

**Files:**
- Create: `src/modules/users/{users.module,controller,service}.ts` + spec
- Modify: app.module

**Interfaces:**
- `GET /users`（`user:list`）：分页 + keyword（username/nickname ilike）+ departmentId 过滤；**where = dataScopeService.buildFilter(...) ∩ 查询条件**；列表不返回 passwordHash。
- `GET /users/:id`（`user:read`）：详情需同时满足数据范围（不在范围内 → 404，不泄漏存在性），含 roleIds。
- `POST /users`（`user:create`）：argon2 哈希、创建用户 + UserRole 事务；username 唯一冲突 → 409。
- `PATCH /users/:id`（`user:update`）：可改 nickname/email/status/departmentId/roleIds（全可选）；**置为 DISABLED 时同事务后 `tokenService.revokeAllFamilies(id)`**；不能改 isSuperadmin。
- `POST /users/:id/reset-password`（`user:reset-password`）：重置为新密码，吊销其全部 family。
- 数据范围注意：创建/更新目标用户的部门不强制在操作者范围内（学习项目从简，靠功能码限制）。

- [ ] **Step 1: users.service.spec.ts**：列表 where 合并 dataScope；禁用触发 revokeAllFamilies；reset-password 更新哈希并吊销；范围外详情 404；username 冲突 409。
- [ ] **Step 2: 实现**（事务用 `prisma.$transaction`）；写操作 audit（用户创建/更新/禁用/重置密码，重置不记明文）。
- [ ] **Step 3: 验证 + Commit** `feat(user-system): users CRUD with data scope`

---

### Task 10: Systems 模块

**Files:** `src/modules/systems/*`（module/controller/service + spec）
**Interfaces:** `GET /systems`（`system:list`，返回全部按 sort）、`POST`（`system:create`，code 唯一 409）、`PATCH /:id`（`system:update`）、`DELETE /:id`（`system:delete`：下有角色或菜单 → 409）。
- [ ] **Step 1:** spec 覆盖唯一冲突与删除引用保护。
- [ ] **Step 2:** 实现 + audit + Commit `feat(user-system): systems CRUD`

---

### Task 11: Roles 模块

**Files:** `src/modules/roles/*` + spec
**Interfaces:**
- `GET /roles?systemId=&page=&pageSize=`（`role:list`）：按系统分页，含 menuIds。
- `POST /roles`（`role:create`）：创建角色 + RoleMenu（事务）；(systemId, code) 冲突 409；校验 menuIds 均属于该 systemId，否则 422。
- `PATCH /roles/:id`（`role:update`）：不可改 systemId；menuIds 全量覆盖（删旧插新，事务）；同样校验归属。
- `DELETE /roles/:id`（`role:delete`）：有 UserRole 关联 → 409。
- [ ] **Step 1:** spec：菜单越系统 422、覆盖授权后权限并集变化（配合 mock 断言 RoleMenu 先 deleteMany 再 createMany）、删除保护。
- [ ] **Step 2:** 实现 + audit（`role_menus_updated` 记录 before/after menuIds）+ Commit `feat(user-system): roles CRUD with menu grants`

---

### Task 12: Menus 模块

**Files:** `src/modules/menus/*` + spec
**Interfaces:**
- `GET /menus/tree?systemId=`（`menu:list`）：该系统全量三态树（管理页用，含 BUTTON/disabled）。
- `POST /menus`（`menu:create`）：校验 systemId 存在；parentId 同系统存在；permissionCode 同系统唯一（409）；BUTTON 的 path/component 必须为空、MENU 必须有 path（422）。
- `PATCH /menus/:id`（`menu:update`）：不可改 systemId；防环同部门规则；上述约束继续生效。
- `DELETE /menus/:id`（`menu:delete`）：有子节点 → 409；RoleMenu 关联随 onDelete:Cascade 自动清除。
- [ ] **Step 1:** spec：三态字段约束、防环、唯一冲突、删除保护。
- [ ] **Step 2:** 实现 + audit + Commit `feat(user-system): menus three-type tree CRUD`

---

### Task 13: Auth 收尾——profile / 切换系统 / 会话 / 改密

**Files:** 修改 `src/modules/auth/{auth.controller.ts,auth.service.ts}` + spec
**Interfaces:**
- `GET /auth/profile`：返回 profileResponseSchema.data（当前 token.systemId）。
- `POST /auth/switch-system`（body switchSystemSchema）：校验可进入（PermissionsService.accessibleSystems 包含目标 code；超管任意）→ 用当前用户签发**新 AT**（新 systemId，RT family 不变）+ 返回 `{ accessToken, profile }`；audit `system_switched`。
- `GET /auth/sessions`：listFamilies，当前 family 由 cookie rt 哈希反查标记 current。
- `DELETE /auth/sessions/:familyId`：只能操作本人 family（非本人 → 404）。
- `POST /auth/change-password`：校验旧密码（错误 401）→ 更新哈希 → revokeOthers（保留当前 family）；audit `password_changed`。
- [ ] **Step 1:** spec：切换到无权限系统 403；切系统后新 AT 解出的 systemId 变化；他人 family 404；旧密码错误 401；改密后其他 family 被吊销。
- [ ] **Step 2:** 实现；AT 重签复用 TokenService 新增方法 `reissueAccessToken(user, systemId)`（本 Task 同步加到 token.service 并补单测）。
- [ ] **Step 3:** 全量单测 + typecheck + Commit `feat(user-system): profile, switch-system, sessions, change-password`

---

### Task 14: 幂等种子

**Files:**
- Create: `packages/database/prisma/seed.ts`
- Modify: packages/database/package.json（prisma.seed 配置用 bun：在 package.json 加 `"prisma": { "seed": "bun run prisma/seed.ts" }`）

**内容（全部 upsert，按 code/name 找存在）：**
1. System `admin`（"后台管理系统"）。
2. 部门：总部 → 研发中心 → 前端组/后端组；市场部（总部下）。
3. 菜单树（system=admin）：
   - 目录 `系统管理`(icon settings) 下：
     - 菜单 用户管理 `/system/users` component `system/users`，权限码 `user:list`；其按钮 `user:create user:update user:delete user:reset-password`
     - 菜单 角色管理 `/system/roles` `role:list`；按钮 `role:create role:update role:delete`
     - 菜单 菜单管理 `/system/menus` `menu:list`；按钮 `menu:create menu:update menu:delete`
     - 菜单 部门管理 `/system/departments` `dept:list`；按钮 `department:create department:update department:delete`
     - 菜单 系统管理 `/system/systems` `system:list`；按钮 `system:create system:update system:delete`
   - 目录 `个人中心`：菜单 个人信息 `/profile` component `profile`（无权限码，登录即可见）；会话管理页挂其下（菜单，无码）。
4. 超管：username/password 取 env（SEED_ADMIN_*，缺省 admin/Admin@123456），argon2id 哈希，isSuperadmin=true，部门=总部。
5. 普通角色 `dept-manager`（dataScope=DEPT，priority=100）勾选 用户管理查看/编辑 + 部门查看；测试用户 `tester/Test@123456`（部门=后端组，挂该角色）。
- [ ] **Step 1:** 实现 seed（先 upsert System/Department 拿 id，菜单按 (permissionCode 或 name+parent) upsert 并回填父子 id；角色菜单按 code 匹配当前节点）。
- [ ] **Step 2:** `bun run --filter @agent-study/database db:seed` 连跑两遍验证幂等（无报错、数量不翻倍——用 `psql`/prisma studio 抽查）。
- [ ] **Step 3:** 用 admin 走 Task 6 的 curl 登录，验证返回菜单树含 5 个管理菜单与全部按钮码。
- [ ] **Step 4: Commit** `feat(database): idempotent seed for admin system`

---

### Task 15: e2e 主链路

**Files:**
- Create: `services/user-system/test/auth.e2e-spec.ts`、`test/setup.ts`（DATABASE_URL 强制 `agent_study_test`，运行前 `prisma migrate deploy` + seed 由脚本保证）
- Modify: package.json 加 `"pretest:e2e": "DATABASE_URL=...test bun run --filter @agent-study/database prisma:deploy && ... db:seed"`（用跨平台方式：新增 `scripts/e2e-env.sh` 导出变量；或在 vitest globalSetup 中设置 `process.env.DATABASE_URL` 后动态 new PrismaClient 执行 migrate——采用 globalSetup 方案，避免 shell 差异）。

**链路（supertest + 真实测试库）：**
1. POST /auth/login（admin）→ 200，Set-Cookie 含 rt，body 有 accessToken/permissions（含 `user:create`）。
2. 无 token GET /users → 401。
3. 带 token GET /users → 200。
4. tester 登录 → 权限不含 `system:create`；POST /systems → 403。
5. admin 给 tester 挂 ALL 范围角色后，tester 调 GET /users 数据范围变化（断言返回人数变多）；解绑后下一请求立即恢复（验证实时查库）。
6. POST /auth/switch-system 到无权限系统 → 403（tester）；admin → 200 且新 token systemId 变化。
7. 用旧 rt 再次 refresh：第一次 200；拿轮换前保存的旧 rt 再刷 → 401，且该 family 全部失效（新 rt 也不能用）。
8. logout 后再 refresh → 401。
- [ ] **Step 1:** globalSetup（设测试库 URL、执行 `prisma db execute` 不便——改用 child_process 跑 `prisma migrate deploy` 与 seed，env 注入测试 URL）。
- [ ] **Step 2:** 实现 8 段断言；每段附注释说明对应 spec 条目。
- [ ] **Step 3:** `bun run --filter @agent-study/user-system test:e2e` 全绿；`bun run typecheck`。
- [ ] **Step 4: Commit** `test(user-system): auth and rbac end-to-end flow`

---

## Self-Review 记录

- Spec 覆盖：登录/刷新/复用检测/登出（T5/T6）、切系统/profile/会话/改密（T13）、 Guards+装饰器（T7）、五管理域（T8-T12）、部门数据范围（T7/T9）、超管短路（T7 测试 + e2e）、动态菜单树（T12 + 种子）、审计埋点（T4，各写操作 Task 内调用）、cookie/CORS（T4/T6）、限流（T6）、种子（T14）、测试策略（T5/T7/T9/T11/T15）。
- 类型一致性：AuthUser 字段在 T6 定义、T7/T9/T13 消费一致；profile 结构 T6 与 contracts profileResponseSchema 对齐；TokenService 方法名跨任务一致（reissueAccessToken 在 T13 补入）。
- 已知简化（spec 允许）：创建/更新目标用户的部门不做操作者数据范围校验；菜单节点变更后历史角色授权靠 onDelete cascade；pino 仅 stdout。

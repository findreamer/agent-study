# agent-study — 用户系统（RBAC）

Monorepo：NestJS 后端 + Next.js 前端 + Prisma/PostgreSQL 数据层 + 共享 zod 契约包。

## 目录结构

```
services/user-system   # 后端（NestJS，端口 4002，全局前缀 /api）
clients/admin-web      # 前端（Next.js 16 + HeroUI v3，端口 3003）
packages/database      # Prisma schema / migration / seed
packages/contracts     # zod 契约（前后端共享类型与校验）
infra/compose          # docker compose（postgres）
docs/superpowers       # 设计 spec 与实施计划
```

## 前置要求

- Bun ≥ 1.2
- Docker（仅用于 postgres 容器）

## 快速启动

```bash
# 1) 安装依赖
bun install

# 2) 起数据库
docker compose -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml up -d postgres

# 3) 环境文件（.env 已被 gitignore，首次需手动复制）
cp packages/database/.env.example packages/database/.env
cp services/user-system/.env.example services/user-system/.env
cp clients/admin-web/.env.example clients/admin-web/.env   # 如无则按需创建

# 4) 建表 + 种子（幂等，可重复执行）
bun run --filter @agent-study/database prisma:deploy
bun run --filter @agent-study/database db:seed

# 5) 起后端（4002）
bun run --filter @agent-study/user-system dev

# 6) 起前端（3003，另开终端）
bun run --filter @agent-study/admin-web dev
```

打开 <http://localhost:3003>，用下方测试账号登录。

## 环境变量

后端 `services/user-system/.env`（从 `.env.example` 复制）：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DATABASE_URL` | Postgres 连接串 | `postgresql://agent:agent@localhost:5432/agent_study?schema=public` |
| `JWT_SECRET` | AT 签名密钥（≥32 字符） | dev 占位值，**生产必须覆盖** |
| `JWT_AT_TTL` | AccessToken 有效期 | `1d` |
| `RT_TTL_DAYS` | RefreshToken 有效期（天） | `30` |
| `COOKIE_DOMAIN` | rt cookie 域，本地保持 `localhost` | `localhost` |
| `CORS_ORIGIN` | 允许凭证跨域的前端来源 | `http://localhost:3003` |
| `PORT` | 后端端口 | `4002` |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | 种子超管账密 | `admin` / `Admin@123456` |

前端 `clients/admin-web/.env`：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | 后端地址 | `http://localhost:4002` |

## 测试账号（seed 内置）

| 账号 | 密码 | 说明 |
|---|---|---|
| `admin` | `Admin@123456` | 超级管理员，全部菜单与按钮权限 |
| `tester` | `Test@123456` | `dept-manager` 角色：`user:list / user:update / dept:list / department:create / department:update`，数据范围=本部门 |

## 测试

```bash
bun run --filter @agent-study/user-system test        # 后端单测
bun run --filter @agent-study/user-system test:e2e    # 后端 e2e（supertest）
bun run --filter @agent-study/admin-web test          # 前端单测（vitest）
bun run typecheck                                     # 全仓类型检查（turbo）
```

## 认证机制要点

- **AT**：JWT，仅存前端内存（禁止 localStorage）；后端逐请求实时判定权限。
- **RT**：httpOnly cookie `rt`（path=`/api/auth`，30 天），轮换 + family 复用检测；logout 服务端撤销整个 family。
- **401 单飞刷新**：并发请求只触发一次 refresh，失败统一清状态跳登录页。
- **前端权限**：`<Can>` / `usePermissions` 只做显隐体验，安全以后端 Guard 为准。

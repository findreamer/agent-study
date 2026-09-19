# RBAC 权限模块设计文档

- 日期：2026-09-19
- 分支：feat/user-system
- 状态：待评审
- 技术栈：NestJS 12 + Prisma + PostgreSQL（后端）、Next.js 16 + React 19 + Tailwind 4 + HeroUI（前端）、Bun + Turborepo monorepo

## 1. 目标与范围

在现有 monorepo 中新增一套后台管理系统的认证与 RBAC 权限子系统，支持多应用（System）隔离、动态菜单树、按钮/接口级权限码、部门树与角色级数据范围、设备会话管理。

### 1.1 本期范围内

- 账号密码登录（argon2id）、AccessToken/RefreshToken 双 token、RefreshToken 轮换与复用检测
- 多应用（System）概念：角色按系统隔离，登录后可切换当前系统，菜单/权限随系统切换变化
- 用户、角色、系统、菜单、部门五个管理域的 CRUD
- 目录 / 菜单 / 按钮三级动态菜单树，权限码挂在菜单树节点上
- 页面 + 按钮 + 接口三层权限控制（后端接口强制校验，前端仅体验层）
- 内置超级管理员：绕过一切功能权限与数据范围校验，操作仍走审计埋点
- 部门树 + 角色级数据范围（全部 / 本部门及以下 / 本部门 / 仅本人），用户列表先行落地
- 前端权限驱动菜单、按钮级显隐、动态路由、系统切换器、会话（设备）管理
- 审计埋点接口与结构化日志 sink（不落库）

### 1.2 范围外（明确不做）

- 多租户隔离、跨系统独立的部门树
- 用户级额外授权 / deny 拒绝语义（功能权限只有角色授予并集）
- 字段级脱敏与通用行级权限框架（仅实现可复用的数据范围 where 过滤器）
- TOTP 两步验证、OAuth/OIDC 第三方登录（不预留对接代码）
- 审计日志落库与审计查询页（仅预留埋点）
- WebSocket/SSE 权限变更实时推送

## 2. 工程架构

| 位置 | 包名 | 职责 |
|---|---|---|
| `services/user-system` | `@agent-study/user-system` | NestJS 12，端口 **4002**。auth/users/roles/systems/menus/departments 六个业务模块 + common（config/prisma/guards/decorators/filters/interceptors/audit） |
| `packages/database` | `@agent-study/database` | Prisma schema、migration、`PrismaService`、seed 脚本。独立成包，其他服务以后可复用 |
| `clients/admin-web` | `@agent-study/admin-web` | Next.js 16 + React 19 + Tailwind 4 + HeroUI，端口 **3003** |
| `packages/contracts`（已存在） | `@agent-study/contracts` | 前后端共享 zod schema、枚举、统一响应类型，前后端直接 import，防止 DTO 漂移 |

基础设施改动：

- `infra/compose/compose.dev.yaml` 增加 postgres 服务（容器内 5432，healthcheck + 命名 volume 持久化）
- 仓库根与两个新应用各提供 `.env.example`
- 根 `package.json` 的 `dev` 脚本 turbo filter 增加两个新包；保留 clean:ports 并把 4002/3003 纳入清理
- 后端测试沿用 services/chat 已有的 vitest 模式

## 3. 数据模型

共 8 张表。不建独立 permission 表——权限码是菜单树节点的属性，避免菜单与权限双份维护。

### 3.1 System（应用系统）

| 字段 | 说明 |
|---|---|
| id | cuid |
| code | 唯一，如 `admin`、`chat` |
| name | 展示名 |
| status | `ENABLED` / `DISABLED` |
| sort | int |
| createdAt / updatedAt | |

### 3.2 Department（部门，全局唯一一棵树，跨系统共享）

| 字段 | 说明 |
|---|---|
| id | cuid |
| parentId | 自关联，可空（根节点） |
| name | |
| leader | 负责人显示名，可空 |
| sort / status / createdAt / updatedAt | |

子树查询用 PostgreSQL 递归 CTE 取部门 id 集合；不引入闭包表或路径枚举。删除有子部门或仍有用户归属的部门时拒绝。

### 3.3 User（用户）

| 字段 | 说明 |
|---|---|
| id | cuid |
| username | 唯一，登录名 |
| passwordHash | argon2id |
| nickname / email（可空） | |
| status | `ACTIVE` / `DISABLED` |
| **isSuperadmin** | bool，默认 false。绕过功能权限与数据范围的**唯一**依据，不使用"超管角色" |
| departmentId | 可空，单一部门归属 |
| lastLoginAt | 可空 |
| createdAt / updatedAt | |

用户不做物理删除，只禁用（保全关联与未来审计）。禁用用户时立即吊销其全部 RefreshToken family。

### 3.4 Role（角色，按系统隔离）

| 字段 | 说明 |
|---|---|
| id | cuid |
| systemId | 外键 System |
| code / name | code 在同一系统内唯一：`@@unique([systemId, code])` |
| status | `ENABLED` / `DISABLED` |
| priority | int，数值小者优先级高；用于管理页排序及数据范围同值裁定 |
| dataScope | `ALL` / `DEPT_AND_SUB` / `DEPT` / `SELF` |
| remark | 可空 |
| createdAt / updatedAt | |

删除仍被用户引用的角色时拒绝。

### 3.5 Menu（目录 / 菜单 / 按钮三态树 + 权限码）

| 字段 | 说明 |
|---|---|
| id | cuid |
| systemId | 外键 System，菜单树按系统隔离 |
| parentId | 自关联，可空 |
| type | `DIR`（目录）/ `MENU`（页面）/ `BUTTON`（按钮/操作） |
| name | 展示名 |
| path | 路由路径，DIR/BUTTON 可空 |
| component | 前端组件注册表 key，仅 MENU |
| icon | 可空 |
| permissionCode | 如 `user:create`；DIR 为空，MENU/BUTTON 携带 |
| visible | bool，菜单是否在侧边栏显示（隐藏路由仍可访问） |
| status | `ENABLED` / `DISABLED` |
| sort | int |
| createdAt / updatedAt | |

约束：permissionCode 在同一 systemId 内唯一（允许 null）；删除有子节点的节点时拒绝。

### 3.6 关联表

- **UserRole**：`(userId, roleId)` 联合主键。多角色，功能权限取并集。
- **RoleMenu**：`(roleId, menuId)` 联合主键。角色配置页勾选整棵树，存勾选节点 id。

### 3.7 RefreshToken（token 族，支撑轮换与复用检测）

| 字段 | 说明 |
|---|---|
| id | cuid |
| userId | 外键 User |
| familyId | 每次登录生成一个族（≈ 一台设备/一次会话） |
| tokenHash | 唯一索引，只存 SHA-256 哈希，不存明文 |
| expiresAt | 有效期 30 天 |
| rotatedAt | 可空，正常轮换时置位 |
| revokedAt | 可空，主动吊销（登出/改密/禁用/复用检测） |
| reuseFlaggedAt | 可空，检测到旧 token 复用时置位 |
| userAgent / ip | 可空，设备列表展示用 |
| createdAt | |

### 3.8 关键语义

1. **系统准入**：用户在目标系统下至少有一个启用角色（UserRole → Role(status=ENABLED, systemId=X)）即可切换；超管可进入任意系统。
2. **有效功能权限**：当前系统下所有启用角色 → RoleMenu → 启用 Menu 节点中 MENU/BUTTON 的 permissionCode 并集。
3. **数据范围**：当前系统下所有启用角色的 dataScope 取最宽者：`ALL > DEPT_AND_SUB > DEPT > SELF`；同值时 priority 仅作展示排序，不改变范围结果。超管恒为 ALL。
4. **权限实时查库**，不写入 JWT；解绑菜单/禁用角色/禁用用户在下一次请求即生效。

## 4. 认证与 Token 设计

### 4.1 Token 形态

- **AccessToken**：JWT，TTL **1 天**。claims：`sub`、`username`、`isSuperadmin`、`systemId`。不含权限码。
- **RefreshToken**：48 字节随机不透明串（非 JWT），TTL **30 天**。
- **传递方式**：RefreshToken 仅通过 httpOnly、SameSite=Lax、Secure（生产）、`path=/auth/refresh` 的 cookie 下发，前端 JS 不可读；AccessToken 由响应体返回，前端保存在内存（zustand），不写 localStorage。整页加载时先靠 cookie 静默刷新重建会话。
- CORS：凭证模式，明确 origin 白名单 + `credentials: true`，禁止 `*`。

### 4.2 登录 `POST /auth/login`（@Public + 限流）

1. 按 username 查用户；argon2id 校验密码；校验 status=ACTIVE。任何失败统一返回相同 401（防用户名探测），并写登录失败审计埋点。
2. 创建一个 family，写入首条 RefreshToken 记录（UA/IP）。
3. 默认系统：超管 → code=`admin`；普通用户 → 其第一个有启用角色的系统（按 System.sort）。
4. 返回：AccessToken、用户信息、当前系统的菜单树与权限码并集、可进入系统列表。
5. `@nestjs/throttler` 限流：10 次/分钟/IP。

### 4.3 刷新 `POST /auth/refresh`（@Public，cookie）

1. cookie 缺失/格式错 → 401。
2. 哈希查记录：
   - 命中、未轮换、未吊销、未过期 → 置 rotatedAt，同 family 新建记录，下发新 AT + 新 RT（正常轮换）。
   - 命中但 rotatedAt/revokedAt 已置位（旧 token 被再次使用）→ **判定泄露**：吊销整个 family 全部记录、置 reuseFlaggedAt、写安全审计埋点，返回 401。
   - 未命中或已过期 → 401。
3. 刷新时校验用户仍 ACTIVE，否则吊销 family 返回 401。
4. 刷新只发新 AT（携带原 systemId），不返回菜单；菜单由前端按需重拉 profile。

### 4.4 切换系统 `POST /auth/switch-system { systemCode }`

需有效 AT。超管或在目标系统有启用角色方可切换。签发仅 systemId 改变的新 AccessToken；RefreshToken/family 不变（身份会话与系统上下文解耦）。返回新 AT + 目标系统菜单树/权限码。前端清空权限状态并重渲染。写审计埋点。

### 4.5 其他认证接口

- `GET /auth/profile`：用户信息 + 当前系统菜单树 + 权限码 + 可进入系统列表。前端聚焦/重载时重拉此接口实现权限刷新。
- `POST /auth/logout`：吊销当前 family，清 cookie。
- `GET /auth/sessions`：当前用户全部 family（UA、IP、最近轮换时间、是否当前 family）。
- `DELETE /auth/sessions/:familyId`：吊销指定 family（强制下线），只能操作本人。
- `POST /auth/change-password`：校验旧密码，更新哈希，吊销**其他全部** family，保留当前会话。
- 用户管理内的"重置密码"为管理员操作（需 `user:reset-password`），不要求旧密码。

## 5. 后端鉴权与数据范围

### 5.1 鉴权链（两道 Guard，全局注册）

1. **JwtAuthGuard**：全局默认开启，`@Public()` 装饰器豁免（login/refresh）。解析并校验 AT，加载用户当前记录（含 status、isSuperadmin、departmentId）挂到 `request.user`；用户已禁用则 401。
2. **PermissionsGuard**：读取 `@Permissions('user:create')` 声明的权限码：
   - `isSuperadmin === true` → 直接放行（仍经过审计埋点）；
   - 否则经 PermissionsService 实时查询当前 systemId 下的有效权限并集，全部命中才放行，否则 403。
   - 单次请求内缓存查询结果；跨请求不缓存（保证即时生效）。

权限码约定 `resource:action`。接口装饰器声明与 Menu 种子节点必须一致——**seed 是权限码的单一登记来源**，新增接口需同步在种子菜单树登记 BUTTON 节点。

### 5.2 数据范围过滤器

可复用的 `DataScopeService.buildFilter(user, systemId): Prisma.WhereInput`：

- 超管 → `{}`
- ALL → `{}`
- DEPT_AND_SUB → `{ departmentId: { in: 递归CTE(本部门含后代) } }`
- DEPT → `{ departmentId: user.departmentId }`
- SELF → 对应用户主键列 = 本人（用户列表场景为 `{ id: user.id }`）
- 用户无部门且范围需要部门时 → 强制退化为仅本人（结果为空安全）

本期挂载于 Users 列表/详情；以后任何带部门归属的表复用同一过滤器。多角色范围取最宽者。

### 5.3 横切设施

- `packages/contracts` 定义 zod schema 与推断类型；Nest 用 ZodValidationPipe 接入；前端直接复用。
- 统一响应壳 `{ code: 0, data, message: 'ok' }`；全局异常过滤器输出 `{ code, message }`，HTTP 状态码语义标准（401 未认证 / 403 无权限 / 404 / 409 冲突如唯一约束 / 422 校验）。
- `AuditService.log({ event, targetType, targetId, before?, after?, ip, ua })`：接口先行，当前 sink = pino 结构化日志（不落库）。埋点位置：登录成功/失败、token 复用、系统切换、登出、改密、用户/角色/菜单/系统/部门的增删改、权限分配变更。
- PrismaService 生命周期管理、配置全部走 env + 校验（zod）。

## 6. 前端设计（admin-web）

### 6.1 引导与会话

- 路由组：`(auth)/login`；`(admin)` 受保护布局。
- 受保护布局：内存无 AT 时先调 refresh → 再拉 `/auth/profile`；期间全屏 loading；401 跳登录页（带 redirect 参数）。
- HTTP 封装：fetch 拦截器附带 AT；响应 401 时**单飞**（in-flight Promise 复用）调用一次 refresh 后重试原请求；仍 401 才清状态跳登录。
- 权限即时性策略：登录时一次性拉取当前系统权限码+菜单树存内存；**整页加载、切换系统、窗口重新聚焦（节流 ≥30 秒）**时静默重拉 profile。写操作被后端 403 拒绝时提示"权限已变更，请刷新"。
- 所有访问控制以后端 Guard 为准，前端隐藏仅为体验。

### 6.2 权限驱动 UI

- 侧边栏：菜单树中 `visible && ENABLED` 的 DIR/MENU 渲染；BUTTON 不出现。
- 动态路由："component 字符串 → 页面组件"注册表（`app/(admin)/*` 下真实页面文件 + 一份 registry map），Next 下不做文件系统动态 glob。
- `<Can permission="user:create">` 组件 + `usePermissions()` hook 控制按钮/操作显隐；超管前端同样短路。
- Header：系统切换器（可进入系统列表）、个人菜单（个人中心/登出）。

### 6.3 页面清单

登录页；Dashboard；用户管理（表格、部门筛选、新增/编辑、多角色分配、禁用、重置密码）；角色管理（作用域 = 当前系统，菜单树三态勾选授权、dataScope 选择、priority）；菜单管理（树形表格 CRUD）；系统管理（CRUD）；部门管理（树形 CRUD）；个人中心（改密、会话/设备列表与下线）。

## 7. 种子数据（幂等 upsert）

1. System：`admin`（后台本身）。
2. 部门树示例：总部 / 研发中心（前端组、后端组）/ 市场部。
3. 完整菜单树：系统管理目录（用户管理 user:*、角色管理 role:*、菜单管理 menu:*、部门管理 dept:*、系统管理 system:* 各按钮权限码）+ 个人中心相关节点。
4. 超管账号：username 与密码来自环境变量（默认 admin / 首次部署必读 env 覆盖），isSuperadmin=true，归属总部。
5. 一个默认角色（admin 系统，dataScope=ALL）与一个普通测试用户（归属后端组，演示本部门数据范围）。

## 8. 测试策略

- 单元（vitest）：
  - PermissionsGuard：并集合流、角色禁用/菜单解绑实时失效、超管短路、系统隔离（不持有他系统权限）
  - DataScopeService：四种范围、多角色取最宽、无部门退化、超管 `{}`
  - refresh 轮换：正常轮换、旧 token 复用吊销整个 family、过期/未命中 401、禁用用户刷新失败
  - argon2id 密码校验与统一 401
- e2e（supertest，参考 chat 的 vitest e2e 配置）：登录 → 访问受保护接口 → 切换系统 → 越权 403 → 登出后 refresh 失效，一条主链路。

## 9. 实施阶段（对用户原 plan 的补充映射）

- **Phase 1 工程底座**：初始化三个 workspace；compose 加 postgres（healthcheck+volume）；`.env.example`；turbo filter 与端口（4002/3003）；Prisma + PostgreSQL；8 张表的 schema 与首个 migration；contracts 中先行定义枚举与响应壳。
- **Phase 2 后端核心**：common（config/PrismaService/异常过滤器/响应壳/ZodPipe/审计埋点）；Auth（登录、cookie 刷新+轮换+复用检测、切换系统、profile、sessions、改密、限流）；Users（CRUD+禁用+重置密码+数据范围）；Roles；Systems/Menus；Departments；JwtAuthGuard + PermissionsGuard + @Permissions/@Public。
- **Phase 3 前端核心**：脚手架（HeroUI/Tailwind4）；登录页；受保护布局+引导+单飞刷新；权限驱动侧边栏与动态路由注册表；用户/角色/菜单/系统/部门页；个人中心+会话管理；系统切换器；`<Can>`/usePermissions。
- **Phase 4 集成收尾**：前后端联调；启动脚本与环境变量文档；幂等 seed；单元与 e2e 测试；CORS 凭证配置核对。

## 10. 关键决策记录

| 决策点 | 结论 |
|---|---|
| 权限粒度 | 页面 + 按钮 + 接口；后端强制，前端体验层 |
| 超管 | User.isSuperadmin 布尔标识，绕过校验但留审计埋点 |
| RefreshToken | 落库，30 天，轮换 + family 复用检测，httpOnly cookie |
| AccessToken | JWT，1 天，不含权限码 |
| 审计 | 只埋点不落库，结构化日志 sink |
| 组织维度 | 无租户；全局单棵部门树；用户单一部门 |
| 系统 | 多应用，角色按系统隔离，支持会话内切换 |
| 角色 | 多角色并集；无 deny；priority 仅排序/同值裁定；dataScope 取最宽 |
| 菜单 | 目录/菜单/按钮三态树，权限码即节点属性，动态数据库配置 |
| 额外授权 | 不支持用户级权限覆盖 |
| 认证方式 | 仅账号密码（argon2id） |
| 前端权限时效 | 登录全量拉取 + 重载/切系统/聚焦节流重拉；后端逐请求实时判定 |

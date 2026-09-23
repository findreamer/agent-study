# RBAC 前端实施计划 v2（clients/admin-web）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

# RBAC Frontend Implementation Plan (v2)

**Goal:** 交付 RBAC 后台前端（5 页）：登录页、用户管理（含部门管理 Drawer）、角色管理（系统/菜单/权限分组授权树）、权限配置中心（菜单+权限码 CRUD）、个人信息（改密+会话管理）；SaaS Modern+Clean 设计体系。

**Architecture:** Next.js 16 App Router；`(auth)` 与 `(admin)` 路由组；zustand 内存 store；fetch 封装（自动 Bearer、401 单飞刷新重试）；全部表单为右侧 Drawer；侧边栏固定 272px 图标+文字、由后端菜单动态渲染；权限判定前端短路体验、安全以后端 Guard 为准。

**Tech Stack:** Next.js 16.3、React 19.2、Tailwind CSS 4、HeroUI 3.2.6（含原生 Drawer）、lucide-react（图标）、zustand 5、zod、@agent-study/contracts、vitest + @testing-library/react。

**Spec:** `docs/superpowers/specs/2026-09-19-rbac-design.md` 第 6 节 + 用户设计要求（见下）
**Design System:** `design-system/rbac-admin/MASTER.md`（实施任何页面前必读；页面级覆盖查 `design-system/rbac-admin/pages/`）

## Global Constraints

- 端口 **3003**；API base `NEXT_PUBLIC_API_BASE_URL=http://localhost:4002`；后端全局前缀 `/api`。
- 所有请求 `credentials: 'include'`（RefreshToken 靠 httpOnly cookie，名 `rt`）。
- AccessToken 只存 zustand 内存，**禁止 localStorage/sessionStorage/persist 中间件**。
- **设计体系（用户指定，实施前读 MASTER.md）：** 主色深蓝 `#1E40AF`（hover `#1E3A8A`），辅色浅灰系（slate：`#F1F5F9/#E2E8F0/#F8FAFC`），文字 `#1E293B`/`#475569`，危险 `#DC2626`；字体 Inter + 系统栈（含 PingFang SC/Microsoft YaHei）；侧边栏固定 **272px**；**表单一律右侧 Drawer（`Drawer.Content placement="right"`），禁止居中 Modal**；表格带分页、搜索、行级操作；权限分配为三态 Checkbox 树（系统/菜单/权限分组）；图标用 lucide-react SVG，禁止 emoji 图标；动效仅 CSS 150-250ms（Drawer 入 240/出 180ms），尊重 `prefers-reduced-motion`。
- **页面清单（用户指定）：** `/login`、`/users`、`/roles`、`/permission-center`、`/profile`。部门管理并入用户管理页（Drawer 内），系统管理页不做（seed 维护），会话管理并入个人信息页 Tabs；根路径 `/` 重定向到 `/users`。
- 前端权限只控制显隐与提示；403 时 Toast 提示"权限已变更，请刷新"。
- HeroUI v3 组件 API 查询：`curl "https://heroui.com/api/agent/page?path=/docs/react/components/<name>"`；写代码前先读对应文档（table、drawer、select、checkbox、toast、dropdown、tabs、autocomplete 已知存在）。
- 界面文案中文；每个 Task 跑 `bun run typecheck`，通过后按给定 message 提交。
- 前端测试只覆盖纯逻辑（单飞刷新、权限判定、store、授权树三态计算）；页面行为在第三阶段 GUI 黑盒验收。

## File Structure

```
design-system/rbac-admin/MASTER.md            # 设计系统 SOT（已持久化）
packages/database/prisma/seed.ts              # Task 0：菜单树对齐 5 页
clients/admin-web/
  package.json next.config.ts postcss.config.mjs tsconfig.json vitest.config.ts
  src/
    app/
      layout.tsx globals.css                  # @heroui/styles + Inter + 设计 tokens
      (auth)/layout.tsx (auth)/login/page.tsx
      (admin)/layout.tsx (admin)/page.tsx     # page.tsx = redirect('/users')
      (admin)/[...slug]/page.tsx              # 动态组件注册表兜底
      (admin)/{users,roles,permission-center,profile}/page.tsx   # 薄壳
    lib/
      api/client.ts                           # fetch 封装 + 单飞刷新
      auth/{auth.store.ts,use-permissions.tsx}
      shell/{sidebar.tsx,header.tsx,bootstrap.tsx,page-header.tsx}
      ui/drawer-form.tsx                      # Drawer 表单壳（Header/Body/Footer + loading）
    features/
      departments/{departments.api.ts,departments.manager.tsx}   # 嵌入用户页
      users/{users.api.ts,users.page.tsx,user-drawer.tsx}
      roles/{roles.api.ts,roles.page.tsx,role-drawer.tsx,menu-grant-tree.tsx}
      permission-center/{menus.api.ts,permission-center.page.tsx,menu-drawer.tsx}
      profile/{profile.api.ts,profile.page.tsx}   # Tabs: 基本信息/改密/会话管理
    lib/registry.tsx                          # component key -> 页面组件
```

---

### Task 0: 后端 seed 菜单树对齐（packages/database）

**Files:**
- Modify: `packages/database/prisma/seed.ts`

**Interfaces:**
- Produces: 重建库后 seed 出的菜单树仅含 5 页；sidebar path 与前端路由一致；component key 与前端 registry 一致。

- [ ] **Step 1: 更新 seed 菜单树**

新树（system=admin）：

```
DIR 系统管理 (icon=settings)
  MENU 用户管理    path=/users              component=users              code=user:list   icon=users
    BUTTON 新建 user:create / 编辑 user:update / 删除 user:delete / 重置密码 user:reset-password
    BUTTON 部门新建 department:create / 部门编辑 department:update / 部门删除 department:delete（visible=false，并入用户页）
  MENU 角色管理    path=/roles              component=roles              code=role:list   icon=key-round
    BUTTON 新建 role:create / 编辑 role:update / 删除 role:delete
  MENU 权限配置中心 path=/permission-center component=permission-center  code=menu:list   icon=shield-check
    BUTTON 新建 menu:create / 编辑 menu:update / 删除 menu:delete
DIR 个人中心 (icon=user-circle)
  MENU 个人信息    path=/profile            component=profile            code=null        icon=user-circle
```

seed.ts 修改要点：`pageWithButtons` 改为接收上述结构（路径/组件/图标）；`dept-manager` 角色授权改为 `user:list, user:update, department:create, department:update, dept:list`（注意 `dept:list` 权限码现挂在用户管理页 BUTTON 或改为 menu 节点 code——保持 `dept:list` 作为独立 BUTTON code 挂在用户管理下，部门树查看受其保护）；删除 system:* 按钮（系统管理页不再下发，接口仍受保护，仅超管可用）。会话管理菜单删除（并入 profile 页 Tabs，接口无需权限码）。

- [ ] **Step 2: 重建库并验证**

```bash
docker compose -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml down -v
docker compose -f infra/compose/compose.yaml -f infra/compose/compose.dev.yaml up -d postgres
# 等 healthy 后：
bun run --filter @agent-study/database prisma:deploy
bun run --filter @agent-study/database db:seed
```
psql 抽查：`SELECT path, component, "permissionCode" FROM "Menu" WHERE type='MENU';` 应只有 4 行（/users /roles /permission-center /profile）。

- [ ] **Step 3: 全量后端测试回归** `bun run --filter @agent-study/user-system test && bun run --filter @agent-study/user-system test:e2e`，全绿。
- [ ] **Step 4: Commit** `feat(database): align seed menu tree with admin frontend v2`

---

### Task 1: 脚手架（Next 16 + Tailwind 4 + HeroUI v3 + 设计系统）

**Files:**
- Create: `clients/admin-web/` 全部配置文件、`src/app/{layout.tsx,globals.css}`
- Modify: 根 `package.json`（可选 dev filter）

**Interfaces:**
- Produces: `next dev -p 3003` 启动；首页渲染 HeroUI Button；设计 tokens 生效（主按钮深蓝）。

- [ ] **Step 1: package.json**（在 v1 计划基础上 + `lucide-react ^0.460.0`；其余同：next 16.3.5、react 19.2.8、@heroui/react 3.2.6、zustand ^5、zod ^3.25、devDeps 含 vitest/jsdom/testing-library）
- [ ] **Step 2: 配置文件** —— next.config.ts / postcss.config.mjs / tsconfig.json / eslint.config.mjs 复制 chat-web（见 v1 Task 1 Step 2），`.env.example`：`NEXT_PUBLIC_API_BASE_URL=http://localhost:4002`
- [ ] **Step 3: globals.css（设计系统落地）**

```css
@import "@heroui/styles";
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@theme {
  /* design-system/rbac-admin/MASTER.md tokens */
  --font-sans: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI',
    'PingFang SC', 'Microsoft YaHei', sans-serif;
  --color-primary: #1E40AF;
  --color-primary-hover: #1E3A8A;
  --color-background: #F8FAFC;
  --color-foreground: #1E293B;
  --color-muted: #E2E8F0;
  --color-muted-foreground: #475569;
  --color-border: #E2E8F0;
  --color-destructive: #DC2626;
}
```

`src/app/layout.tsx`：`<html lang="zh-CN"><body className="min-h-screen bg-background font-sans text-foreground antialiased">{children}</body></html>`，metadata "RBAC 管理后台"。
- [ ] **Step 4: 临时首页**：HeroUI `<Button color="primary">测试</Button>`，浏览器确认按钮为深蓝 #1E40AF。
- [ ] **Step 5: vitest 配置**：`plugins:[react()]`、`environment:'jsdom'`、`globals:true`、setup `@testing-library/jest-dom/vitest`。
- [ ] **Step 6: 安装验证 + Commit** `feat(admin-web): scaffold with heroui, design tokens and inter`

---

### Task 2: API Client + Auth Store（TDD）

**Files:**
- Create: `src/lib/api/client.ts`、`src/lib/auth/auth.store.ts`、对应 `.test.tsx`

**Interfaces:**
- Produces:
- `apiFetch<T>(path, init?): Promise<T>`：拼 API_BASE、`credentials:'include'`、带 Bearer；401 单飞 `POST /api/auth/refresh` 后重试一次；解包响应壳返回 `data`；非 2xx 抛 `ApiError(status, message, issues?)`。
- `refreshOnce(setTokens?): Promise<boolean>`：模块级 in-flight Promise 复用；refresh 也失败返回 false。
- `registerAuthHooks(hooks)` / `registerClearStore(fn)`：store 桥接（避免 client→store 循环依赖）。
- `useAuthStore`：`{ accessToken, user, currentSystemCode, systems, menus, permissions, bootstrapped }` + `setSession({accessToken, profile})` / `setProfile(profile)` / `setBootstrapped(v)` / `clear()`。

- [ ] **Step 1: client.test.ts（失败）**：① 正常 GET 带 Bearer 并解包 data；② 并发两个 apiFetch 遇 401 仅触发 1 次 refresh，均重试成功；③ refresh 失败 → clear() + 抛 ApiError(401)；④ 403 不触发 refresh；⑤ 422 带 issues。（fetch mock 按 URL 分支；完整实现代码见 v1 计划 Task 2 Step 3/4，`AuthHooks = { accessToken: string|null; applyRefreshedToken(t: string): void }`，getter 动态读取 store）
- [ ] **Step 2: Run** `bun test src/lib/api` Expected FAIL → 实现 client.ts + auth.store.ts（含 registerAuthHooks 注入与 `clear()`）。
- [ ] **Step 3: store 测试**：setSession 后含 menus/permissions、clear 复位。
- [ ] **Step 4: 全绿 + typecheck + Commit** `feat(admin-web): api client with single-flight refresh and auth store`

---

### Task 3: 登录页（/login）

**Files:**
- Create: `src/app/(auth)/layout.tsx`、`src/app/(auth)/login/page.tsx`

**Interfaces:**
- Consumes: `apiFetch<LoginResponse>('/api/auth/login', {method:'POST', body: JSON.stringify(loginSchema.parse(form))})`；`useAuthStore.setSession`。

- [ ] **Step 1: (auth)/layout.tsx** —— 已有 accessToken 时 `redirect('/')`；否则居中卡片布局（`min-h-dvh flex items-center justify-center bg-background`）。
- [ ] **Step 2: login page**（写前查 HeroUI input/card 文档）——`"use client"`；Card 内：标题"RBAC 管理后台"、用户名/密码 Input（可见 label、autocomplete="username/current-password"、密码显隐切换）、主色登录 Button（loading 禁用）；成功 `setSession` → `router.replace(searchParams.get('redirect') ?? '/users')`；401 内联错误"用户名或密码错误"（`role="alert"`）；回车提交。
- [ ] **Step 3: 手工验证**：错误密码报错；admin/Admin@123456 登录成功跳转。
- [ ] **Step 4: Commit** `feat(admin-web): login page`

---

### Task 4: Admin Shell（272px 侧边栏 + Header + 引导）

**Files:**
- Create: `src/app/(admin)/layout.tsx`、`src/app/(admin)/page.tsx`（redirect）、`src/lib/shell/{sidebar.tsx,header.tsx,bootstrap.tsx,page-header.tsx}`、`src/lib/ui/drawer-form.tsx`
- Modify: `src/app/(auth)/login/page.tsx` 的跳转目标（如需）

**Interfaces:**
- Consumes: store、`refreshOnce`、`apiFetch<ProfileResponse>('/api/auth/profile')`。
- Produces: `<DrawerForm open title footerLoading onSubmit>` 通用右侧 Drawer 壳（Drawer.Backdrop > Content placement="right" > Dialog > Header/Heading + Body + Footer，Esc 关闭、焦点进入、关闭按钮 aria-label）。

- [ ] **Step 1: bootstrap.tsx** —— 首挂且 `!bootstrapped`：`accessToken` 为空先 `await refreshOnce()`；成功后 `apiFetch('/api/auth/profile')` → `setProfile`；refresh/profile 失败 → `router.replace('/login?redirect=' + pathname)`；期间全屏 Spinner。
- [ ] **Step 2: sidebar.tsx（按 MASTER.md Sidebar 规范）**：`fixed inset-y-0 left-0 w-[272px] border-r bg-white`，内容区 `pl-[272px]`；从 store.menus 渲染（ENABLED && visible，DIR/MENU，BUTTON 不渲染）；DIR → 分组标题（12px muted），MENU → `<Link href={menu.path}>`（h-10、rounded-md、lucide 图标 20px + 文字；`menu.icon` 字符串映射 `lucide-react` 组件表 `{ settings, users, key-round, 'shield-check', 'user-circle' }`，未知 icon 回退 Circle）；激活态 `bg-primary/10 text-primary font-medium` + 左 3px 指示条（usePathname === menu.path）。
- [ ] **Step 3: header.tsx** —— 56px 高 sticky：左当前系统名；右 Dropdown（nickname + 个人信息/退出登录）；登出 → `POST /api/auth/logout` → `clear()` → `/login`。系统切换 Select（systems.length > 1 时显示；`POST /api/auth/switch-system` 成功后 `setSession`（返回 accessToken+profile））。
- [ ] **Step 4: (admin)/page.tsx** —— `redirect('/users')`。
- [ ] **Step 5: drawer-form.tsx** —— 通用 Drawer 壳（接口见上），宽 `min(480px,100vw)`、复杂表单 640px。
- [ ] **Step 6: 手工验证**：未登录访问 /users → 登录并回跳；整页刷新靠 cookie 恢复；侧边栏图标+文字渲染、激活高亮；登出跳登录。
- [ ] **Step 7: Commit** `feat(admin-web): 272px dynamic sidebar shell and bootstrap`

---

### Task 5: 权限基件 `<Can>` / usePermissions（TDD）

**Files:**
- Create: `src/lib/auth/use-permissions.tsx`、`src/lib/shell/use-focus-refetch.ts`、测试

**Interfaces:**
- Produces: `usePermissions(): { codes: Set<string>; can(code): boolean }`（超管恒 true）；`<Can permission fallback?>`；聚焦节流 ≥30s 静默重拉 profile。

- [ ] **Step 1: use-permissions.test.tsx**（失败）：granted 显示 / missing 不显示 / isSuperadmin 恒显示。
- [ ] **Step 2: 实现**（v1 计划 Task 5 的代码原样）+ **use-focus-refetch.ts**：window focus 节流 30s → `apiFetch('/api/auth/profile')` → `setProfile`；在 (admin)/layout 调用一次。
- [ ] **Step 3: 全绿 + typecheck + Commit** `feat(admin-web): can component, usePermissions and focus refetch`

---

### Task 6: 组件注册表 + 动态路由兜底

**Files:**
- Create: `src/lib/registry.tsx`、`src/app/(admin)/[...slug]/page.tsx`

**Interfaces:** 显式路由优先；catch-all 按 store 菜单 `component` key 解析 registry；未匹配 `notFound()`。

- [ ] **Step 1: registry.tsx**

```tsx
import dynamic from 'next/dynamic';
import type { ComponentType } from 'react';

export const componentRegistry: Record<string, ComponentType> = {
  users: dynamic(() => import('../features/users/users.page')),
  roles: dynamic(() => import('../features/roles/roles.page')),
  'permission-center': dynamic(
    () => import('../features/permission-center/permission-center.page'),
  ),
  profile: dynamic(() => import('../features/profile/profile.page')),
};
```

- [ ] **Step 2: catch-all page**：`params.slug` 拼 path → store.menus 深度查找 → component key → registry；无匹配 `notFound()`。
- [ ] **Step 3: 验证**（seed component key 与 registry 完全一致）+ **Commit** `feat(admin-web): component registry and catch-all route`

---

### Task 7: 用户管理（/users，含部门管理 Drawer）

**Files:**
- Create: `features/departments/{departments.api.ts,departments.manager.tsx}`、`features/users/{users.api.ts,users.page.tsx,user-drawer.tsx}`、`app/(admin)/users/page.tsx`

**Interfaces:**
- `listUsers(query: UserListQuery): Promise<Paged<UserBrief>>`、`getUser(id)`、`createUser(input)`、`updateUser(id, input)`、`resetUserPassword(id, newPassword)`
- `getDepartmentsTree(): Promise<DepartmentNode[]>`、`createDepartment/updateDepartment/removeDepartment`、`flattenTree(nodes): Array<DepartmentNode & { depth: number }>`

- [ ] **Step 1: 两个 api.ts**（query 用 URLSearchParams；flattenTree 递归带 depth）。
- [ ] **Step 2: users.page.tsx（MASTER.md 表格页规范）**：
  - PageHeader：标题"用户管理" + 主操作"新建用户"（`<Can permission="user:create">`，primary 深蓝）；
  - 筛选区：搜索 Input（keyword，回车/按钮触发）+ 部门 Select（树拍平）+ "部门管理"次级按钮（`dept:list`）；
  - Table 列：用户名、昵称、邮箱、部门、角色、状态 Chip（启用/禁用）、行级操作（Dropdown：编辑 `user:update` / 重置密码 `user:reset-password` / 禁用或启用 `user:update`）；
  - 分页器右下（page/pageSize/total，改页码重查）；ApiError 403 Toast"权限已变更，请刷新"；409 Toast"用户名已存在"。
- [ ] **Step 3: departments.manager.tsx** —— Drawer（`dept:list` 打开）：左侧部门树（缩进列表、选中高亮）；选中节点显示"新建子部门 `department:create` / 编辑 `department:update` / 删除 `department:delete`"；删除 409 Toast"存在子部门或用户"。部门表单为 Drawer 内嵌小表单（名称/父部门/负责人/排序）。
- [ ] **Step 4: user-drawer.tsx** —— `<DrawerForm>`：用户名（创建必填/编辑禁用）、初始密码（仅创建，显隐切换）、昵称、邮箱、所属部门 Select（树拍平）、角色多选（CheckboxGroup，角色来自 `GET /api/roles?systemId=<当前系统id>`）；编辑回填 roleIds；提交 loading；422 issues 逐字段显示。
- [ ] **Step 5: 手工验证**：admin 全功能；tester 只见本部门；新建用户分配 dept-manager 后用 tester 登录验证数据范围。
- [ ] **Step 6: Commit** `feat(admin-web): users management with departments drawer`

---

### Task 8: 角色管理（/roles，系统/菜单/权限分组授权树）

**Files:**
- Create: `features/roles/{roles.api.ts,roles.page.tsx,role-drawer.tsx,menu-grant-tree.tsx}`、`app/(admin)/roles/page.tsx`

**Interfaces:**
- `listRoles(query: RoleListQuery): Promise<Paged<RoleDetail>>`、`createRole(input: CreateRoleInput)`、`updateRole(id, input)`、`removeRole(id)`
- `getMenuTree(query: MenuTreeQuery): Promise<MenuNode[]>`（供授权树）

- [ ] **Step 1: roles.api.ts**。
- [ ] **Step 2: roles.page.tsx** —— 表格页规范：列：名称、code、优先级、数据范围 Chip（ALL=全部 / DEPT_AND_SUB=本部门及以下 / DEPT=本部门 / SELF=仅本人）、状态、行级操作（编辑 `role:update` / 删除 `role:delete`，409 Toast"角色已分配给用户"）；搜索 + 分页。角色作用域恒为当前系统。
- [ ] **Step 3: menu-grant-tree.tsx（三态 Checkbox 树，MASTER.md 权限树规范）**：
  - 顶部分组标题 = 当前系统名（"按 系统 / 菜单 / 权限 分组"）；DIR 节点为菜单分组（可勾选，勾选=含全部后代）；MENU 下 BUTTON 列表显示权限码（`font-mono text-xs text-muted-foreground`）；
  - 纯函数 `computeTreeState(nodes, checked: Set<string>): { checkedSet, indeterminateSet }` —— 父 checked ⇔ 全部后代 checked；部分选中 → isIndeterminate；点击父节点 = 全选/全不选后代；
  - 输出 `menuIds: string[]`（含 DIR id）。
- [ ] **Step 4: role-drawer.tsx** —— `<DrawerForm width 640>`：名称、code（编辑禁用）、状态、priority（NumberInput）、dataScope Select（中文四项）、remark；下方授权树；提交 create/update（menuIds 全量覆盖）；422 显示 issues。
- [ ] **Step 5: computeTreeState 单测**（全选/全不选/部分选中聚合、点击父节点传播）。
- [ ] **Step 6: 手工验证**：创建受限角色 → 挂给测试用户 → 其侧边栏/按钮变化；越权写操作 403 Toast。
- [ ] **Step 7: Commit** `feat(admin-web): roles management with grouped grant tree`

---

### Task 9: 权限配置中心（/permission-center，菜单+权限码 CRUD）

**Files:**
- Create: `features/permission-center/{menus.api.ts,permission-center.page.tsx,menu-drawer.tsx}`、`app/(admin)/permission-center/page.tsx`

**Interfaces:**
- `getMenuTree(query: MenuTreeQuery): Promise<MenuNode[]>`、`createMenu(input)`、`updateMenu(id, input)`、`removeMenu(id)`

- [ ] **Step 1: menus.api.ts**。
- [ ] **Step 2: permission-center.page.tsx**：
  - PageHeader：标题"权限配置中心" + "新建节点"（`menu:create`）；
  - 系统选择 Select（超管可切 store.systems 内其他系统查看；普通用户仅当前系统，无下拉）；
  - 树形表格（缩进行，MASTER.md）：名称、类型 Chip（目录/菜单/按钮）、权限码（mono）、路径/组件、可见/状态、排序、行级操作（编辑 `menu:update` / 删除 `menu:delete`，409 Toast"存在子节点"）。
- [ ] **Step 3: menu-drawer.tsx** —— `<DrawerForm>`：类型 Select（目录/菜单/按钮）、名称、父节点 Select（本系统树拍平 + 顶级）、路径、组件、图标、权限码、可见 Switch、状态、排序；BUTTON 无路径约束、MENU 必填路径等交后端 422 展示。
- [ ] **Step 4: 手工验证** CRUD；新建按钮节点后角色页授权树立即出现。
- **Step 5: Commit** `feat(admin-web): permission center with menu tree CRUD`

---

### Task 10: 个人信息（/profile，信息 + 改密 + 会话管理 Tabs）

**Files:**
- Create: `features/profile/{profile.api.ts,profile.page.tsx}`、`app/(admin)/profile/page.tsx`

**Interfaces:**
- `changePassword(input)` → `POST /api/auth/change-password`
- `listSessions(): Promise<SessionInfo[]>` → `GET /api/auth/sessions`
- `revokeSession(familyId)` → `DELETE /api/auth/sessions/:familyId`
- `logout()` → `POST /api/auth/logout`

- [ ] **Step 1: profile.api.ts**。
- [ ] **Step 2: profile.page.tsx** —— HeroUI Tabs（基本信息 / 修改密码 / 会话管理）：
  - 基本信息：Card 展示 username/nickname/email/部门/角色（只读，本期不改资料）；
  - 修改密码：旧密码/新密码/确认（前端校验一致且 ≥8 位，提交经 `changePasswordSchema.parse`）；成功 Toast"密码已修改，其他设备已下线"；401 内联"旧密码错误"；
  - 会话管理：表格（设备 UA、IP、最近使用、当前设备 Chip）+ 行操作"下线"（当前行禁用）；下线当前设备 → Toast + `clear()` → `/login`。
- [ ] **Step 3: 手工验证**：改密后另一浏览器会话 refresh 失效；远程下线立即生效。
- **Step 4: Commit** `feat(admin-web): profile page with password and sessions tabs`

---

## Self-Review 记录

- 用户设计要求覆盖：SaaS Modern+Clean + #1E40AF/浅灰/Inter（MASTER.md + Task 1 tokens）；272px 图标侧边栏动态渲染（Task 4）；表格分页/搜索/行级操作（Task 7-9）；Drawer 表单（Task 4 壳 + 7/8/9/10）；三态 Checkbox 权限树按系统/菜单/权限分组（Task 8）；5 页清单（Task 3/7/8/9/10）；部门并入用户页（Task 7）、会话并入 profile（Task 10）、系统页不做（Task 0 seed 不下发）。
- Spec 6.1/6.2 覆盖：引导（T4）、单飞刷新（T2）、聚焦重拉（T5）、动态路由注册表（T6）、`<Can>`/usePermissions（T5）、Header 切换/登出（T4）、侧边栏过滤（T4）。
- 类型一致性：apiFetch/refreshOnce/ApiError（T2）；setSession/setProfile（T2→T4）；registry key 与 seed component 完全一致（users/roles/permission-center/profile）；DrawerForm（T4→T7/8/9）；computeTreeState（T8 单测与 UI 消费一致）。
- 后端影响：Task 0 仅动 seed（菜单树精简 + 路径对齐），权限码与接口不变，e2e 回归全绿作为闸门。
- 已知简化：sidebar 图标映射表维护少量 lucide 名；表格树用缩进行；超管跨系统查看权限中心仅只读切换 Select（配置仍作用于所选系统）。
